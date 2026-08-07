const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class PinkyClassApp {}
const source = fs.readFileSync(path.join(__dirname, '..', 'scores.js'), 'utf8');
vm.runInNewContext(source, { PinkyClassApp, console });
const app = new PinkyClassApp();

test('lớp trống không sinh Lớp 0', () => {
    assert.equal(app.getStudentScoreClassGroups({ gradeLevel: '', class: '' }).length, 0);
});

test('khối 7 và chữ Lớp 7 được gộp thành một lựa chọn', () => {
    const groups = app.getStudentScoreClassGroups({ gradeLevel: 7, class: 'Lớp 7' });
    assert.equal(groups.length, 1);
    assert.equal(groups[0].label, 'Lớp 7');
});

test('lớp có hậu tố vẫn được giữ riêng và lọc đúng', () => {
    const student = { gradeLevel: 7, class: '7A' };
    const groups = app.getStudentScoreClassGroups(student);
    const classGroup = groups.find(group => group.label === '7A');
    assert.ok(classGroup);
    assert.equal(app.scoreStudentMatchesClass(student, 'group:' + encodeURIComponent(classGroup.key)), true);
});
