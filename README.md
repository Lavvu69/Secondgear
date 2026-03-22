SecondGear - Setup Guide (New PC)

This project runs a Node.js backend with a MySQL database (via XAMPP). The backend also serves the frontend pages.

**Requirements**
1. Install XAMPP (for MySQL + phpMyAdmin).
2. Install Node.js (LTS recommended).
3. (Optional) A code editor like VS Code.

**Quick Setup**
1. Start XAMPP.
2. In XAMPP Control Panel, start `Apache` and `MySQL`.
3. Open `http://localhost/phpmyadmin` in your browser.
4. Create a database named `SecondGearDB`.
5. Import `secondgeardb.sql` (included in this folder) into `SecondGearDB`. Import `cars.sql` if needed.
6. Open a terminal in `SecondGear\Back-End`.
7. Install dependencies:
```bash
npm install
```
8. Run the server:
```bash
node server.js
```
9. Open the site:
```text
http://localhost:5000
```

**Notes**
1. Database credentials are in `Back-End/server.js`.
   host: `localhost`, user: `root`, password: ``, database: `SecondGearDB`.
   If your MySQL root password is not blank, update it in `Back-End/server.js`.
2. Email sending uses Nodemailer and Gmail. Update these in `Back-End/server.js` if you want emails to work on a new PC.
   `user` and `pass` in the Nodemailer `createTransport` config.
3. The backend serves the frontend files from `Front-End`. Opening `Home.html` directly is not recommended. Use `http://localhost:5000` instead.
4. The server runs on port `5000`. If the port is already in use, change `PORT` in `Back-End/server.js`.

**Troubleshooting**
1. "DB Error" on startup:
   Make sure XAMPP MySQL is running, the database name is `SecondGearDB`, and credentials match `Back-End/server.js`.
2. "Module not found":
   Run `npm install` inside `Back-End`.
3. Images not saving:
   Ensure the folders exist: `Front-End/images/cars` and `Front-End/images/verification`.
