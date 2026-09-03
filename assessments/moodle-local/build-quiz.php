<?php
/**
 * Build a Moodle quiz from a question-bank XML file — no web UI.
 *
 * Imports the questions (honouring the <question type="category"> marker),
 * creates a quiz activity in a course, adds every imported question to it,
 * and clones all quiz settings (behaviour, attempts, review options, …) from
 * an existing "template" quiz so the deferred-feedback / review-timing setup
 * matches the rest of the course.
 *
 * Runs INSIDE the local Moodle container (see ../README-moodle-local or the
 * `moodle-local` memory):
 *
 *   docker cp assessments/kickoffs/ko5.xml            moodle-local:/tmp/q.xml
 *   docker cp assessments/moodle-local/build-quiz.php moodle-local:/tmp/build-quiz.php
 *   docker exec moodle-local php /tmp/build-quiz.php \
 *       --xml=/tmp/q.xml --course=2 --name="KO 5 — Interference" \
 *       --template-quiz=1 --section=1 \
 *       --open="2026-09-07 11:00" --close="2026-09-07 23:59" --grade=2
 *
 * Re-run safe: refuses if a quiz of the same name already exists in the course.
 * To rebuild, delete that quiz in Moodle (or with `moosh activity-delete`) first.
 */

define('CLI_SCRIPT', true);
require('/var/www/html/config.php');
global $DB, $CFG;
require_once($CFG->libdir . '/clilib.php');
require_once($CFG->dirroot . '/question/format.php');
require_once($CFG->dirroot . '/question/format/xml/format.php');
require_once($CFG->dirroot . '/course/lib.php');
require_once($CFG->dirroot . '/mod/quiz/lib.php');
require_once($CFG->dirroot . '/mod/quiz/locallib.php');
require_once($CFG->libdir . '/questionlib.php');

list($opt, $unrecognised) = cli_get_params([
    'xml' => null, 'course' => null, 'name' => null,
    'template-quiz' => null, 'section' => 1,
    'open' => null, 'close' => null, 'grade' => null, 'tz' => 'America/New_York',
    'help' => false,
], ['h' => 'help']);

if ($opt['help'] || !$opt['xml'] || !$opt['course'] || !$opt['name'] || !$opt['template-quiz']) {
    cli_writeln("required: --xml --course --name --template-quiz");
    cli_writeln("optional: --section (1) --open \"Y-m-d H:i\" --close \"…\" --grade N --tz (America/New_York)");
    exit($opt['help'] ? 0 : 1);
}

$COURSEID   = (int)$opt['course'];
$SECTIONNUM = (int)$opt['section'];
$QUIZNAME   = $opt['name'];

// run as the site admin so capability checks (creating question categories) pass
\core\session\manager::set_user(get_admin());

$course    = $DB->get_record('course', ['id' => $COURSEID], '*', MUST_EXIST);
$coursectx = context_course::instance($COURSEID);

if ($DB->record_exists('quiz', ['course' => $COURSEID, 'name' => $QUIZNAME])) {
    cli_error("A quiz named \"$QUIZNAME\" already exists in course $COURSEID — delete it first.");
}

// -- 1. import questions (creates nested categories from the XML markers) -----
$fallbackcat = $DB->get_record('question_categories',
        ['contextid' => $coursectx->id, 'parent' => 0], '*', IGNORE_MULTIPLE)
    ?: $DB->get_record('question_categories', ['contextid' => $coursectx->id], '*', IGNORE_MULTIPLE);

$qf = new qformat_xml();
$qf->setCategory($fallbackcat);
$qf->setContexts([$coursectx]);
$qf->setCourse($course);
$qf->setFilename($opt['xml']);
$qf->setRealfilename(basename($opt['xml']));
$qf->setMatchgrades('nearest');
$qf->setCatfromfile(true);
$qf->setContextfromfile(false);
$qf->setStoponerror(true);
if (!$qf->importpreprocess() || !$qf->importprocess() || !$qf->importpostprocess()) {
    cli_error('question import failed');
}
$qids = array_values($qf->questionids);
cli_writeln("imported " . count($qids) . " questions: " . implode(',', $qids));

// -- 2. clone the template quiz's settings -----------------------------------
$quiz = $DB->get_record('quiz', ['id' => (int)$opt['template-quiz']], '*', MUST_EXIST);
unset($quiz->id);
$quiz->name         = $QUIZNAME;
$quiz->intro        = '';
$quiz->introformat  = FORMAT_HTML;
$quiz->sumgrades    = 0;
$quiz->timecreated  = time();
$quiz->timemodified = time();
if ($opt['grade'] !== null) { $quiz->grade = (float)$opt['grade']; }
if ($opt['open'] || $opt['close']) {
    $tz = new DateTimeZone($opt['tz']);
    $quiz->timeopen  = $opt['open']  ? (new DateTime($opt['open'],  $tz))->getTimestamp() : 0;
    $quiz->timeclose = $opt['close'] ? (new DateTime($opt['close'], $tz))->getTimestamp() : 0;
}
$quiz->id = $DB->insert_record('quiz', $quiz);
cli_writeln("created quiz id={$quiz->id}");

// -- 3. wire it into the course --------------------------------------------
$module = $DB->get_record('modules', ['name' => 'quiz'], '*', MUST_EXIST);
$cm = (object)[
    'course' => $COURSEID, 'module' => $module->id, 'instance' => $quiz->id,
    'section' => $SECTIONNUM, 'visible' => 1, 'visibleoncoursepage' => 1,
    'groupmode' => 0, 'groupingid' => 0, 'added' => time(),
];
$cmid = add_course_module($cm);
course_add_cm_to_section($COURSEID, $cmid, $SECTIONNUM);
$DB->set_field('course_modules', 'instance', $quiz->id, ['id' => $cmid]);
context_module::instance($cmid);

// quiz_add_instance() would create the default quiz section; we bypassed it.
$DB->insert_record('quiz_sections',
    (object)['quizid' => $quiz->id, 'firstslot' => 1, 'heading' => '', 'shufflequestions' => 0]);
cli_writeln("created course module cmid={$cmid} in section {$SECTIONNUM}");

// -- 4. add the questions, then grades / calendar / cache -----------------
$quiz->cmid = $cmid;
$quiz->courseid = $COURSEID;
foreach ($qids as $qid) {
    quiz_require_question_use($qid);
    quiz_add_quiz_question($qid, $quiz, 0);
}
quiz_delete_previews($quiz);
quiz_update_sumgrades($quiz);
$quiz->sumgrades = $DB->get_field('quiz', 'sumgrades', ['id' => $quiz->id]);
quiz_grade_item_update($quiz);
if (function_exists('quiz_update_events')) { quiz_update_events($quiz); }
rebuild_course_cache($COURSEID, true);

cli_writeln("\nDONE — sumgrades={$quiz->sumgrades} grade={$quiz->grade}");
cli_writeln("  view:  {$CFG->wwwroot}/mod/quiz/view.php?id={$cmid}");
cli_writeln("  edit:  {$CFG->wwwroot}/mod/quiz/edit.php?cmid={$cmid}");
