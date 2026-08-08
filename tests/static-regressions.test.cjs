const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('HTML không giữ version tài nguyên thủ công', () => {
    assert.doesNotMatch(read('index.html'), /\?v=/);
    assert.match(read('server.js'), /function renderIndexHtml\(\)/);
    assert.match(read('server.js'), /hasCurrentAssetVersion/);
});

test('phiên đăng nhập dùng thời hạn 14 ngày', () => {
    const server = read('server.js');
    assert.ok(server.includes('SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000'));
    assert.ok(server.includes('DEFAULT_IDLE_TIMEOUT_MINUTES = 14 * 24 * 60'));
});

test('schema không có lệnh xóa bảng hoặc mật khẩu mẫu', () => {
    const schema = read('schema-postgres.sql');
    assert.doesNotMatch(schema, /DROP\s+TABLE|TRUNCATE\s+TABLE/i);
    assert.doesNotMatch(schema, /admin123|teacher123|trogiang123/i);
});

test('modal ẩn khỏi focus và accessibility tree', () => {
    assert.match(read('core.js'), /modal\.inert = !open/);
    assert.match(read('core.js'), /aria-hidden/);
    assert.match(read('style.css'), /\.modal-backdrop[\s\S]*?visibility: hidden/);
});

test('xóa tài khoản và học sinh dùng transaction dọn quan hệ', () => {
    const server = read('server.js');
    assert.match(server, /async function deleteUserDataGraph/);
    assert.match(server, /async function deleteStudentDataGraph/);
    assert.match(server, /deleteStudentDataGraph[\s\S]*?DELETE FROM InvoiceAccountSettings WHERE OwnerId = \$1/);
    assert.match(server, /DELETE FROM TuitionPayments/);
    assert.match(server, /DELETE FROM InvoiceTemplates/);
});

test('toolbar xuất nhật ký có bố cục mobile hai nút', () => {
    assert.match(read('index.html'), /log-export-actions/);
    assert.match(read('style.css'), /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

test('cài đặt không còn hiển thị lịch sử bảo mật', () => {
    const settings = read('settings-modern.js');
    assert.doesNotMatch(settings, /settingsHistoryCard|settingsSecurityHistory|loadSecurityHistory/);
});

test('phiếu học phí thêm tiền tố giáo viên và số điện thoại khi xuất', () => {
    const invoice = read('invoice-export.js');
    assert.ok(invoice.includes("return `GV. ${name || '-'}`;"));
    assert.ok(invoice.includes("return `SĐT. ${phone || '-'}`;"));
    assert.match(invoice, /teacherNameDisplay/);
    assert.match(invoice, /teacherPhoneDisplay/);
});

test('hồ sơ học sinh có mũi tên thu gọn theo từng lớp', () => {
    const students = read('students.js');
    const style = read('style.css');
    assert.match(students, /student-grade-chevron/);
    assert.match(style, /student-grade-group-row\.is-expanded \.student-grade-chevron/);
});

test('thống kê lớp học đồng bộ kiểu thẻ lịch dạy', () => {
    const html = read('index.html');
    const style = read('style.css');
    assert.match(html, /class-profile-summary stats-grid/);
    assert.match(html, /class-profile-summary stats-grid[\s\S]*?class="glass-card"/);
    assert.match(style, /#view-classes \.class-profile-summary > \.glass-card/);
    assert.match(style, /\.class-profile-summary > div[\s\S]*?text-align: center/);
});

test('nhãn popup cập nhật buổi học nằm sát ô nhập', () => {
    const style = read('style.css');
    assert.match(style, /#quickSessionEntryModal \.form-group[\s\S]*?gap: 4px/);
    assert.match(style, /#quickSessionEntryModal \.form-group > \.quick-entry-section-label[\s\S]*?margin-bottom: 0/);
});

test('báo cáo học phí có biểu đồ biến động sáu tháng không dùng thư viện ngoài', () => {
    const html = read('index.html');
    const tuition = read('tuition-export.js');
    const style = read('style.css');
    const packageJson = read('package.json');
    assert.match(html, /id="tuitionTrendChart"/);
    assert.match(tuition, /getTuitionTrendMonthKeys\(monthCount = 6\)/);
    assert.match(tuition, /getTuitionTrendData\(monthCount = 6\)/);
    assert.match(tuition, /isSessionCompleted\(session\)/);
    assert.match(tuition, /getStudentSessionFee\(session, studentId\)/);
    assert.match(tuition, /renderTuitionTrendArea\(chart, trendData, maximumTotal\)/);
    assert.match(tuition, /if \(month\.total <= 0\) return/);
    assert.match(tuition, /value\.textContent = month\.total > 0/);
    assert.match(tuition, /appendPath\(unpaidAreaPath, 'is-unpaid'\)/);
    assert.match(tuition, /this\.renderTuitionTrend\(\)/);
    assert.match(style, /\.tuition-trend-area-layout/);
    assert.match(style, /\.tuition-trend-area-shape\.is-total-line/);
    assert.doesNotMatch(packageJson, /chart\.js|highcharts|apexcharts/i);
});

test('hoàn tác thao tác xóa chỉ kéo dài 5 giây', () => {
    const core = read('core.js');
    const style = read('style.css');
    assert.match(core, /Sẽ xóa sau 5 giây/);
    assert.ok(core.includes('}, 5000);'));
    assert.match(style, /undo-countdown 5s linear forwards/);
    assert.doesNotMatch([core, style, read('calendar.js'), read('students.js'), read('users.js')].join('\n'), /7 giây để hoàn tác|Sẽ xóa sau 7 giây|undo-countdown 7s/);
});

test('học phí chỉ dùng trạng thái đã thanh toán hoặc chưa thanh toán', () => {
    const html = read('index.html');
    const calendar = read('calendar.js');
    const server = read('server.js');
    assert.doesNotMatch(html, /monthlyPaymentModal|monthlyPaymentForm|Ghi chú đối soát/);
    assert.doesNotMatch(calendar, /submitMonthlyPayment|openMonthlyPaymentModal|monthly-payments/);
    assert.ok(calendar.includes('body: JSON.stringify({ paid: !!paid, month })'));
    assert.match(calendar, /String\(monthNumber\)\.padStart\(2, '0'\)/);
    assert.ok(!server.includes("app.post('/api/students/:studentId/monthly-payments'"));
    assert.match(server, /String\(month \|\| ''\)\.trim\(\)\.match/);
    assert.match(server, /monthNumber < 1 \|\| monthNumber > 12/);
    assert.match(server, /s.SessionDate >= @fromDate AND s.SessionDate < @toDate/);
});

test('ô giờ buổi học luôn dùng định dạng 24 giờ', () => {
    const html = read('index.html');
    const shell = read('app-shell.js');
    const server = read('server.js');
    assert.doesNotMatch(html, /type="time" id="(?:session|editSession)(?:Start|End)Time"/);
    assert.match(html, /id="sessionStartTime"[\s\S]*?inputmode="numeric"/);
    assert.match(html, /id="sessionEndTime"[\s\S]*?data-allow-24="true"/);
    assert.doesNotMatch(html, /time24HourOptions/);
    assert.match(shell, /initialize24HourTimeInputs/);
    assert.doesNotMatch(shell, /optionList|time24HourOptions/);
    assert.doesNotMatch(shell, /showPicker/);
    assert.match(server, /isValidSessionClockTime/);
    assert.ok(server.includes("time === '24:00'"));
});

test('impersonated login tracking is suppressed', () => {
    const server = read('server.js');
    const settings = read('settings-modern.js');
    const securitySchema = read('security-schema.sql');
    assert.ok(server.includes('if (!authUser || authUser.actorUserId) return;'));
    assert.ok(server.includes('suppressSecurityTracking: true'));
    assert.ok(server.includes('UserId = $2 AND ActorUserId IS NULL'));
    assert.ok(server.includes("if (req.authUser.actorUserId) return res.json([]);"));
    assert.ok(server.includes("if (req.authUser.actorUserId) return res.sendStatus(403);"));
    assert.ok(settings.includes("requestedTab === 'devices' && this.currentUser?.impersonating"));
    assert.ok(settings.includes('devicesTab.hidden = hideDelegatedSessions'));
    assert.ok(securitySchema.includes('DELETE FROM AuthSessions WHERE ActorUserId IS NOT NULL'));
});

test('score cards support inline autosave for values notes and test names', () => {
    const scores = read('scores.js');
    const shell = read('app-shell.js');
    const server = read('server.js');
    const style = read('style.css');
    assert.match(scores, /activateScoreInlineEditing/);
    assert.match(scores, /saveScoreInlineEditor/);
    assert.match(scores, /saveScoreInlineTestName/);
    assert.match(shell, /\[data-score-inline\]/);
    assert.match(shell, /open-session'\) this\.openEditSessionModal/);
    assert.match(scores, /Cập nhật buổi học/);
    assert.match(server, /app\.put\('\/api\/score-tests\/:testGroupId'/);
    assert.match(server, /UPDATE Scores SET TestName = @testName/);
    assert.match(style, /\.score-inline-editor/);
});

test('all app surfaces and tuition invoices use Comfortaa', () => {
    const html = read('index.html');
    const style = read('style.css');
    const invoice = read('invoice-export.js');
    assert.doesNotMatch(html, /fonts\.googleapis\.com|Be\+Vietnam\+Pro|family=Inter|Playfair\+Display/);
    assert.match(style, /Comfortaa-Regular\.ttf/);
    assert.match(style, /Comfortaa-Medium\.ttf/);
    assert.match(style, /Comfortaa-SemiBold\.ttf/);
    assert.match(style, /Comfortaa-Bold\.ttf/);
    assert.match(style, /html\[data-app-theme=(?:"lithos"|lithos)\] body \*/);
    assert.match(invoice, /defaultStyle: \{ font: 'Comfortaa'/);
    assert.match(invoice, /font-family: 'Comfortaa'/);
    assert.doesNotMatch(invoice, /BeVietnamPro|Be Vietnam Pro/);
});
