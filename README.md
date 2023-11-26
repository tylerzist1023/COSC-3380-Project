# Fall 2023 COSC 3380 14351 Team 9: Coog Music

## What's Included

The `nodejs` folder contains the entire codebase for the web application.

- Backend code: All backend code is located in the `server.js` file.
- Frontend code: All frontend source files are found in the `templates` folder of the codebase. The frontend code is purely HTML, CSS, and vanilla JavaScript.
- MySQL Backup file: Attached is a dump file from our MySQL database.

## Installation

1. Install Node and start a MySQL server instance.
2. Load the MySQL backup file into the server using the SOURCE command, passing in the backup file as the first argument.
3. Open a command prompt and change the current directory into the `nodejs` folder.
4. Create a file called `.env` in the 'nodejs' folder and include the following:
```
DB_HOST=<your host>
DB_USER=<your username>
DB_PASSWORD=<your password>
DB_NAME=<your database name>
```
5. Run `npm i` to install the packages needed for the web application.
6. Run `node server.js` to launch the web application.
7. Type `localhost` in your preferred web browser to access the site.