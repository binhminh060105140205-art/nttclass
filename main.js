// ================================================================
// MAIN.JS — Khởi tạo ứng dụng. File này PHẢI được load SAU CÙNG,
// sau khi tất cả các file mixin (auth.js, students.js, calendar.js...)
// đã gắn xong method vào PinkyClassApp.prototype.
// ================================================================

// Instantiate application on load
const app = new PinkyClassApp();
window.app = app; // Make it global
