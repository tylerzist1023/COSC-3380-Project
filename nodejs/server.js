import http from 'http';
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2';
import nunjucks from 'nunjucks';
import url from 'url';
import querystring from 'querystring';
import cookie from 'cookie';
import { createToken, parseToken } from './session.js';
import dotenv from 'dotenv';
import formidable from 'formidable';
import { Readable } from 'stream';
import {fileTypeFromBuffer} from 'file-type';

// bruh...
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Create a connection to the database
//print to the console hehe (Python)
const print = (a) =>console.log(a);
const conn = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

function getRole(session) {
    if(session['logged_in'] === true) {
        return session['role'];
    }
    return undefined;
}

function escapeRegex(r) {
    return r.replace(/[\\\.\+\*\?\^\$\[\]\(\)\{\}\/\'\#\:\!\=\|]/ig, "\\$&");
}

function captureUrl(userUrl, url) {
    let match = userUrl.match(new RegExp(`^${url}(\\?.*)?\\/?$`, 'g')); 
    return match;
}

function matchUrl(userUrl, url) {
    return captureUrl(userUrl, url) !== null;
}

// Function to serve static files
function serveStaticFile(res, filePath, contentType, responseCode = 200) {
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(500);
            res.end('Server Error');
        } else {
            res.writeHead(responseCode, { 'Content-Type': contentType });
            res.end(data);
        }
    });
}

const getListenerBaseData = (userId) => {
  return new Promise((resolve, reject) => {
    const data = {};

    // Get followed artists
    const followQuery = 'SELECT Follow.*, ArtistName, Artist.ArtistID FROM Follow LEFT JOIN Artist ON Follow.ArtistID=Artist.ArtistID WHERE UserID=?';
    conn.query(followQuery, [userId], (err, followResults) => {
      if (err) {
        reject(err);
        return;
      }
      data['following'] = followResults;

      // Get playlists
      const playlistQuery = 'SELECT * FROM Playlist WHERE UserID=?';
      conn.query(playlistQuery, [userId], (err, playlistResults) => {
        if (err) {
          reject(err);
          return;
        }
        data['playlists'] = playlistResults;

        resolve(data);
      });
    });
  });
};


function getListener(sessionData, res) {
    if(getRole(sessionData) !== 'listener') {
        return;
    }

    getListenerBaseData(sessionData['id'])
    .then((data) => {
        console.log(data);

        const newReleasesQuery = 'SELECT AlbumID, AlbumName, ArtistName, Album.ArtistID FROM Album LEFT JOIN Artist ON Album.ArtistID = Artist.ArtistID ORDER BY ReleaseDate DESC LIMIT 10';
        conn.query(newReleasesQuery, (newReleasesError, newReleasesResults) => {
            if (newReleasesError) {
                console.error('Error fetching new releases:', newReleasesError);
                res.status(500).send('Internal Server Error');
                return;
            }

            const forYouQuery = 'SELECT AlbumID, AlbumName, ArtistName, Album.ArtistID FROM Album LEFT JOIN Artist ON Album.ArtistID = Artist.ArtistID INNER JOIN Follow ON Album.ArtistID = Follow.ArtistID WHERE Follow.UserID=? ORDER BY ReleaseDate DESC LIMIT 10';
            conn.query(forYouQuery, [sessionData['id']], (forYouError, forYouResults) => {
                if (forYouError) {
                    console.error('Error fetching for you data:', forYouError);
                    res.status(500).send('Internal Server Error');
                    return;
                }

                data.new_releases = newReleasesResults;
                data.for_you = forYouResults;
                data.username = sessionData['username'];

                res.writeHead(200);
                res.end(nunjucks.render('listener.html', { data: data })); // Assuming you're using a templating engine like 'ejs'
            });
        });
    })
    .catch((error) => {
        console.error(error);
    });
}

function getListenerProfile(sessionData, res) {
    if (getRole(sessionData) !== 'listener') {
        return;
    }

    getListenerBaseData(sessionData.id).then((data) => {
        const userQuery = 'SELECT Listener.UserID, Fname, Lname, COUNT(DISTINCT Follow.ArtistID) FROM Listener LEFT JOIN Follow ON Listener.UserID = Follow.UserID WHERE Listener.UserID=?';
        conn.query(userQuery, [sessionData.id], (userError, userResults) => {
            if (userError) {
                console.error('Error fetching user data:', userError);
                res.status(500).send('Internal Server Error');
                return;
            }

            data.user = userResults[0];

            const playlistsQuery = 'SELECT PlaylistName, Listener.Fname, Listener.Lname, PlaylistID FROM Playlist LEFT JOIN Listener ON Listener.UserID = Playlist.UserID WHERE Playlist.UserID=?';
            conn.query(playlistsQuery, [sessionData.id], (playlistsError, playlistsResults) => {
                if (playlistsError) {
                    console.error('Error fetching playlists:', playlistsError);
                    res.status(500).send('Internal Server Error');
                    return;
                }

                data.playlists = playlistsResults;
                data.username = sessionData.username;

                res.writeHead(200);
                res.end(nunjucks.render('profile_listener.html', { data }));
            });
        });
    });
}

// Create HTTP server
const server = http.createServer((req, res) => {
    nunjucks.configure('templates', { autoescape: true });

    const rawCookies = req.headers.cookie;
    const parsedCookies = cookie.parse(rawCookies);
    const sessionToken = parsedCookies['session'];
    let sessionData = parseToken(sessionToken);

    const parsedUrl = url.parse(req.url);
    const params = querystring.parse(parsedUrl.query);

    // html of the homepage
    if (req.url === '/') {
        if(getRole(sessionData) === 'listener') {
            getListener(sessionData, res);
            return;
        }

        res.end(nunjucks.render('index.html'));
    } else if (matchUrl(req.url, '/profile') && req.method == 'GET') {
        if(getRole(sessionData) === 'listener') {
            getListenerProfile(sessionData, res);
            return;
        }

        res.writeHead(404);
        res.end('Not Found');
    }
    // css of the homepage
    else if (req.url === '/styles.css') {
        serveStaticFile(res, './public/styles.css', 'text/css');
    }
    //picture of Coog Music (top left screen)
    else if(req.url === '/logo.png'){
        serveStaticFile(res,'./public/logo.png',"image/png");
    }
    //picture of Lady Playing the Guitar
    else if(req.url === "/homepage.svg" ){
        serveStaticFile(res,'./public/homepage.svg','image/svg+xml');
    }
    else if(req.url == "/favicon.ico"){
        serveStaticFile(res,"./public/favicon.ico",'');
    }
    //To go to the Login_Options HTML
    else if(req.url == "/getstarted"){
        res.end(nunjucks.render('login_options.html'));
    }
    else if(matchUrl(req.url, '/login') && req.method == 'GET'){
        if(params['role'] === 'listener' || params['role'] === 'artist' || params['role'] === 'admin') {
            res.end(nunjucks.render('login.html', {role:params['role']}));
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    }
    else if(matchUrl(req.url, '/register') && req.method == 'GET'){
        if(params['role'] === 'listener' || params['role'] === 'artist') {
            res.end(nunjucks.render('register.html', {role:params['role']}));
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    } else if(matchUrl(req.url, '/login') && req.method == 'POST') {
        let query = '';
        let vals = [];

        let role = params['role'];
        if(role === undefined) {
            role = 'listener';
        }

        const form = new formidable.IncomingForm();

        form.parse(req, (err,fields,files) => {
            if(role === 'listener') {
                query = 'SELECT UserID FROM Listener WHERE Username=? AND Password=?'
                vals = [fields['username'], fields['password']]
            } else if(role === 'artist') {
                query = 'SELECT ArtistID FROM Artist WHERE Username=? AND Password=?'
                vals = [fields['username'], fields['password']]
            } else if(role === 'admin') {
                query = 'SELECT AdminID FROM Admin WHERE Username=? AND Password=?'
                vals = [fields['username'], fields['password']]
            } else {
                res.writeHead(404);
                res.end('Not found');
                return;
            }

            conn.query(query, vals, (err, results) => {
                if (err) {
                    print(err);
                    res.writeHead(500, { 'Content-Type': 'text/html' });
                    res.end('<h1>Internal Server Error</h1>');
                    return;
                }

                if (results.length > 0) {
                    sessionData = {};
                    if(role === 'listener') {
                        sessionData['id'] = results[0]['UserID']
                    } else if(role === 'artist') {
                        sessionData['id'] = results[0]['ArtistID']
                    } else if(role === 'admin') {
                        sessionData['id'] = results[0]['AdminID']
                    }
    
                    sessionData['role'] = role;
                    sessionData['logged_in'] = true;
                    sessionData['username'] = fields['username'][0]
    
                    res.setHeader('Set-Cookie', `session=${createToken(sessionData)}; HttpOnly`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: 'Login successful' }));
                }
                else {
                    // No matching user found
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Login failed' }));
                }
            });
        });
    } else if (req.url === '/data') {
        // Database query
        conn.query('SELECT * FROM Listener', (err, results) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end('<h1>Internal Server Error</h1>');
                return;
            }
  
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(results));
        });
    } else if(matchUrl(req.url, '/logout') && req.method == 'GET') {
        sessionData = {};
        res.setHeader('Set-Cookie', `session=${createToken(sessionData)}; HttpOnly`);
        // res.writeHead(200);
        // res.end('Logged out');
        res.writeHead(302, { Location: '/' });
        res.end();
    } else if(matchUrl(req.url, '/pic') && req.method == 'GET') {
        if(getRole(sessionData) !== 'listener') {
            res.writeHead(401);
            res.end('<h1>Unauthorized</h1>');
        }

        let query = 'select ProfilePic from Listener where UserID=?';
        let vals = [sessionData['id']];

        conn.query(query, vals, (err, results) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end('<h1>Internal Server Error</h1>');
                return;
            }

            const profilePic = results[0]['ProfilePic'];
            if(profilePic === null) {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('Not found');
                return;
            }
            const { file, mimetype } = getFile(profilePic);

            res.writeHead(200, { 'Content-Type': mimetype });
            res.end(file);
        });
    } else if(matchUrl(req.url, '/artist/([0-9]+)') && req.method == 'GET') {
        let artistId = req.url.split('/')[2];

        let query = 'select * from Artist where ArtistID=?';
        let vals = [artistId];

        conn.query(query, vals, (err, results) => {
            if (err || results.length === 0) {
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end('<h1>Internal Server Error</h1>');
                return;
            }

            res.writeHead(200);
            res.end(JSON.stringify(results));
        });
    } else if(matchUrl(req.url, '/artist/([0-9]+)/pic') && req.method == 'GET') {
        let artistId = req.url.split('/')[2];

        let query = 'select ProfilePic from Artist where ArtistID=?';
        let vals = [artistId];

        conn.query(query, vals, (err, results) => {
            if (err || results.length === 0) {
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end('<h1>Internal Server Error</h1>');
                return;
            }

            const profilePic = results[0]['ProfilePic'];
            if(profilePic === null || profilePic === undefined) {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('Not found');
                return;
            }
            const type = fileTypeFromBuffer(profilePic);
            print(type);

            res.writeHead(200, { 'Content-Type': type });
            res.end(profilePic);
        });
    } else if(matchUrl(req.url, '/album/([0-9]+)/pic') && req.method == 'GET') {

        let albumId = req.url.split('/')[2];

        let query = 'select AlbumPic from Album where AlbumID=?';
        let vals = [albumId];

        conn.query(query, vals, (err, results) => {
            if (err || results.length === 0) {
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end('<h1>Internal Server Error</h1>');
                return;
            }

            const albumPic = results[0]['AlbumPic'];
            if(albumPic === null || albumPic === undefined) {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('Not found');
                return;
            }
            const type = fileTypeFromBuffer(albumPic);
            print(type);

            res.writeHead(200, { 'Content-Type': type });
            res.end(albumPic);
        });
    } else if(matchUrl(req.url, '/playlist/([0-9]+)/pic') && req.method == 'GET') {

        let playlistId = req.url.split('/')[2];

        let query = 'SELECT AlbumPic FROM Album, PlaylistSong, Song WHERE PlaylistSong.SongID=Song.SongID AND Song.AlbumID=Album.AlbumID AND PlaylistID=?';
        let vals = [playlistId];

        conn.query(query, vals, (err, results) => {
            if (err || results.length === 0) {
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end('<h1>Internal Server Error</h1>');
                return;
            }

            const albumPic = results[0]['AlbumPic'];
            if(albumPic === null || albumPic === undefined) {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('Not found');
                return;
            }
            const type = fileTypeFromBuffer(albumPic);
            print(type);

            res.writeHead(200, { 'Content-Type': type });
            res.end(albumPic);
        });
    } else if(matchUrl(req.url, '/song/([0-9]+)') && req.method == 'GET') {

        let songId = req.url.split('/')[2];

        let query = 'select SongID,Song.AlbumID,Name,AlbumName from Song,Album where SongID=? AND Album.AlbumID=Song.AlbumID';
        let vals = [songId];

        conn.query(query, vals, (err, results) => {
            if (err || results.length === 0) {
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end('<h1>Internal Server Error</h1>');
                return;
            }

            results = results[0];

            res.writeHead(200);
            res.end(JSON.stringify({ "albumid":results['AlbumID'],"songname":results['Name'],"artistname":results['AlbumName'] }));
        });
    } else if(matchUrl(req.url, '/song/([0-9]+)/audio') && req.method == 'GET') {

        let songId = req.url.split('/')[2];

        let query = 'select SongFile from Song where SongID=?';
        let vals = [songId];

        conn.query(query, vals, (err, results) => {
            if (err || results.length === 0) {
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end('<h1>Internal Server Error</h1>');
                return;
            }

            const songFile = results[0]['SongFile'];
            if(songFile === null || songFile === undefined) {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('Not found');
                return;
            }
            const type = fileTypeFromBuffer(songFile);
            print(type);

            // player doesn't work right. you'll see what i mean.
            res.writeHead(200, { 'Content-Type': type });
            res.end(songFile);
        });
    } else {
        //print those not found and keep going with this slow slow process
        print(req.url)

        res.writeHead(404);
        res.end('Not Found');
    }
  });
  
  server.listen(5000, () => {
    console.log('Server running on http://localhost:5000');
  });