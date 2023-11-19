import http from 'http';
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2';
import url from 'url';
import querystring from 'querystring';
import cookie from 'cookie';
import { createToken, parseToken } from './session.js';
import dotenv from 'dotenv';
import  Types  from 'formidable';
import { Readable } from 'stream';
import {fileTypeFromBuffer} from 'file-type';
import { getAudioDurationInSeconds } from 'get-audio-duration';

// import nodemon from 'nodemon';

// bruh...
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Create a connection to the database
//print to the console hehe (Python)
const print = (a) =>console.log(a);

let conn = mysql.createConnection({
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

function readFile(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

function removeFile(filePath) {
  return new Promise((resolve, reject) => {
    fs.unlink(filePath, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// Functions to serve static files

function serveStatic_Plus(res, filePath, contentType, replacements, responseCode = 200) {
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            res.writeHead(500);
            res.end('Server Error');
        } else {
            // Replace placeholders with dynamic content
            if (replacements && typeof replacements === 'object') {
                Object.keys(replacements).forEach(key => {
                    // Updated RegExp to match {{ key }} with spaces
                    data = data.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), replacements[key]);
                });
            }
            let conditionalContent = '';
            if (replacements['role'] === 'listener') {
                conditionalContent = `
                    <div class="input_box">
                        <label for="first">First Name</label>
                        <input type="text" name="first" id="first" placeholder="Enter Your First Name">
                    </div>
                    <div class="input_box">
                        <label for="last">Last Name</label>
                        <input type="text" name="last" id="last" placeholder="Enter Your Last Name">
                    </div>
                `;
            } else if (replacements['role'] === 'artist') {
                conditionalContent = `
                    <div class="input_box">
                        <label for="name">Display Name</label>
                        <input type="text" name="name" id="name" placeholder="Enter Your Display Name">
                    </div>
                `;
            }
            data = data.replace('{{conditionalContent}}', conditionalContent);


            res.writeHead(responseCode, { 'Content-Type': contentType });
            res.end(data);
        }
    });
}
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
                //console.log(data.new_releases);

                // res.writeHead(200);
                res.end(JSON.stringify(data));
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
                // serveStatic_Plus(res, './templates/base_listener.html', 'text/html',{ 'role': params['role'] });
                res.end(JSON.stringify(data));
            });
        });
    });
}

// Create HTTP server
const server = http.createServer((req, res) => {

    let rawCookies = req.headers.cookie;
    if(rawCookies === undefined) {
        rawCookies = "";
    }
    const parsedCookies = cookie.parse(rawCookies);
    const sessionToken = parsedCookies['session'];
    let sessionData = parseToken(sessionToken);

    const parsedUrl = url.parse(req.url);
    const params = querystring.parse(parsedUrl.query);

    print(sessionData);

    // html of the homepage
    if (req.url === '/') {
        if(getRole(sessionData) === 'listener') {
            serveStaticFile(res, "./templates/listener.html", "");
            return;
        }

        serveStaticFile(res, './templates/index.html', 'text/html');
    } else if(req.url === '/ajax') {
            getListener(sessionData, res);

    } else if (matchUrl(req.url, '/profile') && req.method === 'GET') {
        if(getRole(sessionData) === 'listener') {
            serveStaticFile(res, "./templates/profile_listener.html", "");
            return;
        }

        res.writeHead(404);
        res.end('Not Found');
    } else if (matchUrl(req.url, '/ajax/profile') && req.method === 'GET') {
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
    else if (req.url === '/base.js') {
        serveStaticFile(res, './public/base.js', 'text/css');
    }
    //picture of Coog Music (top left screen)
    else if(req.url === '/logo.png'){
        serveStaticFile(res,'./public/logo.png',"image/png");
    }
    //picture of Lady Playing the Guitar
    else if(req.url === "/homepage.svg" ){
        serveStaticFile(res,'./public/homepage.svg','image/svg+xml');
    }
    //picture of the logo
    else if(req.url === "/favicon.ico"){
        serveStaticFile(res,"./public/favicon.ico",'');
    }
    //To go to the Login_Options HTML
    else if(req.url === "/getstarted"){
        serveStaticFile(res, './templates/login_options.html', 'text/html');
    }
    //cd Desktop/TRA/COSC-3380-Project/nodejs nodemon server.js
    else if((matchUrl(req.url, '/login') ) &&  req.method === 'GET'){


        if(params['role'] === 'listener' || params['role'] === 'artist' || params['role'] === 'admin') {
            serveStatic_Plus(res, './templates/login.html', 'text/html',{ 'role': params['role'] }); //basically doing nujucks 
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    }
    else if(matchUrl(req.url, '/register') && req.method === 'GET'){
        if(params['role'] === 'listener' || params['role'] === 'artist') {
            console.log(params['role']);
            serveStatic_Plus(res,'./templates/register.html', 'text/html',{ 'role': params['role'] });
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    } else if(matchUrl(req.url, '/login') && req.method === 'POST') {
        let query = '';
        let vals = [];

        let role = params['role'];
        if(role === undefined) {
            role = 'listener';
        }

        const form = new Types.IncomingForm();

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
                    sessionData['username'] = fields['username']
    
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
    } else if(matchUrl(req.url, '/logout') && req.method === 'GET') {
        sessionData = {};
        res.setHeader('Set-Cookie', `session=${createToken(sessionData)}; HttpOnly`);
        res.end();
        // res.writeHead(302, { Location: '/' });
    } 
    else if (matchUrl(req.url, '/edit') && req.method =='GET'){
        serveStaticFile(res, './templates/listener_edit.html', "");
    }
    // Serve Edit Profile Page
    else if (matchUrl(req.url, '/ajax/edit') && req.method =='GET') {
        if (getRole(sessionData) === 'listener') {

            getListenerBaseData(sessionData.id)
            .then((data) => {
                
                const userProfileQuery = 'SELECT Username,Email,Fname,Lname FROM Listener WHERE UserID=?'
                let vals = [sessionData['id']];
                
                const userProfileQueryPromise = new Promise((resolve, reject) => {
                    conn.query(userProfileQuery, vals, (err, results) => {
                        if (err) {
                            reject(err);
                        }
                        else if (results.length === 0) {
                            reject('Album not found');
                        } 
                        else {
                            // Store Query Results
                            data.email= results[0]['Email'];
                            data.Fname = results[0]['Fname'];
                            data.Lname = results[0]['Lname'];
                            console.log(data.email);
                            resolve(data);
                        }
                    });
                });

                Promise.all([userProfileQueryPromise])
                .then(() => {
                    data.username = sessionData.username;
                    res.writeHead(200);
                    res.end(JSON.stringify(data));
                })
                .catch((error) => {
                    console.error('Error fetching data:', error);
                    res.writeHead(500, { 'Content-Type': 'text/html' });
                    res.end('<h1>Internal Server Error</h1>');
                });
            });
            } 
        else {
            res.writeHead(404);
            res.end('Not Found');
        }}
    else if(matchUrl(req.url, '/pic') && req.method === 'GET') {
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
    } else if(matchUrl(req.url, '/artist/([0-9]+)/follow') && req.method === 'GET') {
        if(getRole(sessionData) !== 'listener') {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end("You are not authorized to do that");
            return;
        }

        let artistId = req.url.split('/')[2];

        const followQuery = 'SELECT * FROM Follow WHERE ArtistID=? AND UserID=?';
        conn.query(followQuery, [artistId, sessionData.id], (followError, followResult) => {
            if (followError) {
                console.error(followError);
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end("Internal Server Error");
                return;
            }

            if (followResult.length > 0) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end("You are already following this artist");
                return;
            }

            const insertQuery = 'INSERT INTO Follow (UserID, ArtistID) VALUES (?, ?)';
            conn.query(insertQuery, [sessionData.id, artistId], (insertError) => {
                if (insertError) {
                    console.error(insertError);
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end("Internal Server Error");
                    return;
                }

                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end("Successfully followed");
            });
        });
    } else if(matchUrl(req.url, '/song/([0-9]+)/rate') && req.method === 'POST') {
        let songId = req.url.split('/')[2];

        // Create a new formidable form
        const form = new Types.IncomingForm();

        // Parse form data
        form.parse(req, (err, fields) => {
            if (err) {
                console.error(err);
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end("Internal Server Error");
                return;
            }

            // Check if 'rating' is in the form data
            if (!('rating' in fields)) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end("Specify the rating in the form please");
                return;
            }

            // Check if the user has already rated the song
            const selectQuery = 'SELECT * FROM Rating WHERE SongID=? AND UserID=?';
            conn.query(selectQuery, [songId, sessionData.id], (selectError, selectResult) => {
                if (selectError) {
                    console.error(selectError);
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end("Internal Server Error");
                    return;
                }

                if (selectResult.length > 0) {
                    // Update the existing rating
                    const updateQuery = 'UPDATE Rating SET Value=? WHERE SongID=? AND UserID=?';
                    conn.query(updateQuery, [fields.rating, songId, sessionData.id], (updateError) => {
                        if (updateError) {
                            console.error(updateError);
                            res.writeHead(500, { 'Content-Type': 'text/plain' });
                            res.end("Internal Server Error");
                            return;
                        }

                        res.writeHead(200, { 'Content-Type': 'text/plain' });
                        res.end("Successfully rated song");
                    });
                } else {
                    // Insert a new rating
                    const insertQuery = 'INSERT INTO Rating (UserID, SongID, Value) VALUES (?, ?, ?)';
                    conn.query(insertQuery, [sessionData.id, songId, fields.rating], (insertError) => {
                        if (insertError) {
                            console.error(insertError);
                            res.writeHead(500, { 'Content-Type': 'text/plain' });
                            res.end("Internal Server Error");
                            return;
                        }

                        res.writeHead(200, { 'Content-Type': 'text/plain' });
                        res.end("Successfully rated song");
                    });
                }
            });
        });
    } else if(matchUrl(req.url, '/artist/([0-9]+)/unfollow') && req.method === 'GET') {
        if(getRole(sessionData) !== 'listener') {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end("You are not authorized to do that");
            return;
        }

        let artistId = req.url.split('/')[2];

        const followQuery = 'SELECT * FROM Follow WHERE ArtistID=? AND UserID=?';
        conn.query(followQuery, [artistId, sessionData.id], (followError, followResult) => {
            if (followError) {
                console.error(followError);
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end("Internal Server Error");
                return;
            }

            if (followResult.length === 0) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end("You are not following this artist");
                return;
            }

            const insertQuery = 'DELETE FROM Follow WHERE ArtistID=? AND UserID=?';
            conn.query(insertQuery, [artistId, sessionData.id], (insertError) => {
                if (insertError) {
                    console.error(insertError);
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end("Internal Server Error");
                    return;
                }

                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end("Successfully unfollowed");
            });
        });
    } else if(matchUrl(req.url, '/artist/([0-9]+)/pic') && req.method === 'GET') {
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

            res.writeHead(200, { 'Content-Type': type });
            res.end(profilePic);
        });
    }
    else if (matchUrl(req.url, '/album/([0-9]+)') && req.method === 'GET'){
        if (getRole(sessionData) === 'listener') {
            serveStaticFile(res, './templates/album.html', "");
        }
    }
    // Serve Page for an Album 
    else if (matchUrl(req.url, '/ajax/album/([0-9]+)') && req.method === 'GET') {
        if (getRole(sessionData) === 'listener') {
            getListenerBaseData(sessionData.id)
            .then((data) => {
            let albumId = req.url.split('/')[3];
    
            const albumQuery = 'SELECT AlbumID, AlbumName, Album.ArtistID, AlbumDuration, ReleaseDate, ArtistName FROM Album, Artist WHERE AlbumID=? AND Album.ArtistID=Artist.ArtistID';
            let vals = [albumId];

            const albumQueryPromise = new Promise((resolve, reject) => {
                conn.query(albumQuery, vals, (err, results) => {
                    if (err) {
                        reject(err);
                    }
                    else if (results.length === 0) {
                        reject('Album not found');
                    } 
                    else {
                        // Store Query Results
                        data.albumData = results[0];

                        // Calculate Album Duration in Minutes and Seconds
                        const duration_min = Math.floor(data.albumData['AlbumDuration']/60);
                        const duration_sec = Math.floor(data.albumData['AlbumDuration']%60);

                        data.album_duration = `${duration_min} min ${duration_sec} sec`;

                        // Format Release Date to MM/DD/YYYY
                        const releaseDate = new Date(data.albumData['ReleaseDate']);
                        const formattedDate = releaseDate.toLocaleDateString();
                        data.formattedReleaseDate = formattedDate;
                        
                        resolve(data);
                    }
                });
            });

            const songQuery = 'SELECT ROW_NUMBER() OVER (ORDER BY SongID) row_num,Song.Name,Duration,ArtistName,Artist.ArtistID,Song.SongID FROM Song,Artist,Album WHERE Song.AlbumID=Album.AlbumID AND Album.ArtistID=Artist.ArtistID AND Album.AlbumID=?'

            const songQueryPromise = new Promise((resolve, reject) => {
                conn.query(songQuery, vals, (err, results) => {
                    if (err) {
                        reject(err);
                    }
                    else if (results.length === 0) {
                        reject('No songs in album');
                    }
                    else {
                        data.songData = [];

                        for (const song of results) {
                            const duration_min = Math.floor(song.Duration/60);
                            const duration_sec = Math.floor(song.Duration%60);
                            const duration_str = `${duration_min}:${duration_sec}`;

                            data.songData.push({
                                count: song.row_num,
                                songName: song.Name,
                                Duration: duration_str,
                                artistName: song.ArtistName,
                                artistID: song.ArtistID,
                                songID: song.SongID
                            });
                        }

                        resolve(data);
                    }
                });
            });

            // Queries have completed
            Promise.all([albumQueryPromise, songQueryPromise])

            // Can now get AristID from previous query, use that to do another query for more albums by the artist.
            .then(() => {
                const artistID = data.albumData['ArtistID'];

                const moreByQuery = 'SELECT Artist.ArtistID, ArtistName, AlbumID, AlbumName FROM Album, Artist WHERE Album.ArtistID = Artist.ArtistID AND Album.ArtistID = ? AND Album.AlbumID != ? ORDER BY ReleaseDate DESC LIMIT 10';
                let moreByValues = [artistID, albumId];
                console.log(moreByValues)
            
                const moreByQueryPromise = new Promise((resolve, reject) => {
                  conn.query(moreByQuery, moreByValues, (err, results) => {
                    if (err) {
                      reject(err);
                    } 
                    else {
                      data.more_by = results;
                      resolve(data);
                    }
                  });
                });
            
                return moreByQueryPromise;
            })

            // Get the username and display the page
            .then(() => {
                data.username = sessionData.username;
                res.writeHead(200);
                res.end(JSON.stringify(data));
                // res.end(nunjucks.render('album.html', { data, templateParent: 'base_listener.html', role: getRole(sessionData) }));
            })
            .catch((error) => {
                console.error('Error fetching data:', error);
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end('<h1>Internal Server Error</h1>');
            });
        });
        } 
        else {
            res.writeHead(404);
            res.end('Not Found');
        }
    }

    else if(matchUrl(req.url, '/album/([0-9]+)/pic') && req.method === 'GET') {

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

            res.writeHead(200, { 'Content-Type': type });
            res.end(albumPic);
        });
    } else if(matchUrl(req.url, '/playlist/([0-9]+)') && req.method === 'GET') {
        if(getRole(sessionData) === 'listener') {
            serveStaticFile(res, './templates/playlist.html', "");
        }
    } else if(matchUrl(req.url, '/ajax/playlist/([0-9]+)') && req.method === 'GET') {
        const playlistId = req.url.split('/')[3];

        // Check user role (you'll need to implement get_role function)
        if (getRole(sessionData) !== 'listener') {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end("You are not authorized to do that");
            return;
        }

        // Get playlist data
        getListenerBaseData(sessionData.id).then((data) => {
            

            // Get listener base data
            const baseDataQuery = 'SELECT Follow.*, ArtistName, Artist.ArtistID FROM Follow LEFT JOIN Artist ON Follow.ArtistID=Artist.ArtistID WHERE UserID=?';
            conn.query(baseDataQuery, [sessionData.id], (baseDataError, baseDataResult) => {
                if (baseDataError) {
                    console.error(baseDataError);
                    connection.release();
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end("Internal Server Error");
                    return;
                }

                data.following = baseDataResult;

                // Get playlist details
                const playlistQuery = 'SELECT PlaylistID, PlaylistName, PlaylistDuration FROM Playlist WHERE PlaylistID=?';
                conn.query(playlistQuery, [playlistId], (playlistError, playlistResult) => {
                    if (playlistError) {
                        console.error(playlistError);
                        connection.release();
                        res.writeHead(500, { 'Content-Type': 'text/plain' });
                        res.end("Internal Server Error");
                        return;
                    }

                    data.playlist = playlistResult[0];
                    data.username = sessionData['username'];

                    // Get songs in the playlist
                    const playlistSongsQuery = 'SELECT ROW_NUMBER() OVER (ORDER BY PlaylistSong.SongID) row_num, Name, ArtistName, Duration, Song.SongID FROM Song, PlaylistSong, Artist, Album WHERE Song.SongID=PlaylistSong.SongID AND PlaylistSong.PlaylistID=? AND Song.AlbumID=Album.AlbumID AND Album.ArtistID=Artist.ArtistID';
                    conn.query(playlistSongsQuery, [playlistId], (playlistSongsError, playlistSongsResult) => {
                        if (playlistSongsError) {
                            console.error(playlistSongsError);
                            connection.release();
                            res.writeHead(500, { 'Content-Type': 'text/plain' });
                            res.end("Internal Server Error");
                            return;
                        }

                        data.songs = [];
                        playlistSongsResult.forEach(song => {
                            const duration_min = Math.floor(song.Duration / 60);
                            const duration_sec = song.Duration % 60;
                            const duration_str = `${duration_min}:${duration_sec}`;
                            data.songs.push([song.row_num, song.Name, song.ArtistName, song.Duration, duration_str, song.SongID]);
                        });

                        // Get recommended songs
                        const recommendedSongsQuery = 'SELECT DISTINCT Name, ArtistName, Song.SongID, Artist.ArtistID, Album.AlbumID FROM Song, PlaylistSong, Artist, Album WHERE PlaylistID=? AND Song.AlbumID=Album.AlbumID AND Album.ArtistID=Artist.ArtistID AND GenreCode IN (SELECT DISTINCT GenreCode FROM Song, PlaylistSong WHERE PlaylistID=? AND Song.SongID=PlaylistSong.SongID) LIMIT 10';
                        conn.query(recommendedSongsQuery, [playlistId, playlistId], (recommendedSongsError, recommendedSongsResult) => {
                            if (recommendedSongsError) {
                                console.error(recommendedSongsError);
                                connection.release();
                                res.writeHead(500, { 'Content-Type': 'text/plain' });
                                res.end("Internal Server Error");
                                return;
                            }

                            data.recommended = recommendedSongsResult;

                            res.end(JSON.stringify(data));
                        });
                    });
                });
            });
        });

    } else if(matchUrl(req.url, '/playlist/([0-9]+)/pic') && req.method === 'GET') {
        

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

            res.writeHead(200, { 'Content-Type': type });
            res.end(albumPic);
        });
    } else if(matchUrl(req.url, '/playlist/create') && req.method === 'GET') {
        if(getRole(sessionData) !== 'listener') {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end("You are not authorized to do that");
            return;
        }

        serveStaticFile(res, './templates/create_playlist.html', "");
    } else if(matchUrl(req.url, '/playlist/create') && req.method === 'POST') {
        if(getRole(sessionData) !== 'listener') {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end("You are not authorized to do that");
            return;
        }
        

        const form = new Types.IncomingForm();

        // Parse form data
        form.parse(req, (err, fields) => {
            if (err) {
                console.error(err);
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end("Internal Server Error");
                return;
            }

            // Check if 'rating' is in the form data
            if (!('playlistname' in fields)) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end("Specify the playlist name in the form please");
                return;
            }

            const insertQuery = 'INSERT INTO Playlist (UserID, PlaylistName) VALUES (?, ?)';
            conn.query(insertQuery, [sessionData.id, fields['playlistname']], (insertError) => {
                if (insertError) {
                    console.error(insertError);
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end("Internal Server Error");
                    return;
                }

                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end("Successfully created playlist");
            });
        });
    } else if(matchUrl(req.url, '/song/([0-9]+)') && req.method === 'GET') {

        

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
    } else if(matchUrl(req.url, '/song/([0-9]+)/audio') && req.method === 'GET') {

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

            // player doesn't work right. you'll see what i mean.
            // player works. I think?
            // duration shows but can't seek
            res.writeHead(200, { 'Content-Type': type });
            res.end(songFile);
        });
    } else if (matchUrl(req.url, '/album/create') && req.method === 'GET') {
        if(getRole(sessionData) !== 'artist') {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end("You are not authorized to do that");
            return;
        }

        serveStaticFile(res, './templates/create_al.html', "");
    } else if (matchUrl(req.url, '/genres') && req.method === 'GET') {
        
        conn.query('SELECT Name FROM Genre', (err, results) => {
            let genres = [];
            for(const genre of results) {
                genres.push(genre['Name']);

            }
            res.end(JSON.stringify(genres));
        });
    } else if (matchUrl(req.url, '/album/create') && req.method === 'POST') {
        if(getRole(sessionData) !== 'artist') {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end("You are not authorized to do that");
            return;
        }

        const form = new Types.IncomingForm({multiples: true});

        form.parse(req, (err,fields,files) => {
            console.log(fields, files);

            readFile(files.albumCover.filepath)
            .then((albumCover) => {
                let query = 'INSERT INTO Album (AlbumName, AlbumPic, ArtistID, ReleaseDate) VALUES (?,?,?,?)'
                conn.query(query, [fields.albumName, albumCover, sessionData.id, fields.releaseDate], (err, results) => {
                    if (err || results.length === 0) {
                        res.writeHead(500, { 'Content-Type': 'text/html' });
                        res.end(`<h1>Internal Server Error: ${err}</h1>`);
                        return;
                    }

                    let albumId = results.insertId;

                    let songPromises = [];
                    for(let i = 0; i < fields.songNames.length; i++) {
                        songPromises.push(readFile(files['songs[]'][i].filepath)
                            .then((songAudio) => {
                                getAudioDurationInSeconds(files['songs[]'][i].filepath).then((duration) => {

                                    conn.query('SELECT GenreCode FROM Genre WHERE Name=?', [fields.songGenres[i]], (err,results) => {
                                        if (results.length === 0) {
                                                throw new Error(`Genre not found for song ${fields.songNames[i]}`);
                                            }

                                        const genreCode = results[0]['GenreCode'];

                                        songPromises.push(new Promise((resolve, reject) => { conn.query('INSERT INTO Song (Name, GenreCode, AlbumID, SongFile, Duration, ReleaseDate) VALUES (?, ?, ?, ?, ?, ?)',
                                            [fields.songNames[i], genreCode, albumId, songAudio, duration, fields.releaseDate])}));
                                    });
                                });
                            }));

                    }

                    // This will happen before all the songs are uploaded.
                    res.writeHead(200);
                    res.end("Please wait a moment while your songs are being uploaded. You can close this tab and visit the home page.");
                });

            })
            .then(() => {
                removeFile(files.albumCover.filepath);
            });
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