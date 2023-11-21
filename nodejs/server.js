import http from 'http';
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
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

let pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    idleTimeout:20*1000
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

function parseFormAsync(form, req) {
    return new Promise((resolve, reject) => {
        form.parse(req, (err, fields, files) => {
            if (err) {
                reject(err);
            } else {
                resolve({ fields, files });
            }
        });
    });
}

async function executeQuery(query, values) {
    const connection = await pool.getConnection();
    try {
        const [rows, fields] = await connection.execute(query, values);
        return rows;
    } finally {
        connection.release();
    }
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
const getAdminBaseData= async (userId) => {
    try {
        const data = {};

        // Get all the new songs added
        const NewSongQuery = 'SELECT Song.Name AS SongName, Artist.ArtistName, Artist.ProfilePic FROM Song JOIN Artist ON Song.ArtistID = Artist.ArtistID ORDER BY Song.CreationTimestamp DESC LIMIT 5';
        const NewSongResults = await executeQuery(NewSongQuery);
        data['NewSongs'] = NewSongResults;

        // Get playlists
        const NewArtistQuery = 'SELECT ArtistName, ProfilePic FROM Artist ORDER BY CreationStamp DESC LIMIT 5';
        const NewArtistResults = await executeQuery(NewArtistQuery);
        data['NewArtist'] = NewArtistResults;

        return data;
    } catch (err) {
        throw new Error(`Error in getListenerBaseData: ${err.message}`);
    }
};


const getListenerBaseData = async (userId) => {
    try {
        const data = {};

        // Get followed artists
        const followQuery = 'SELECT Follow.*, ArtistName, Artist.ArtistID FROM Follow LEFT JOIN Artist ON Follow.ArtistID=Artist.ArtistID WHERE UserID=?';
        const followResults = await executeQuery(followQuery, [userId]);
        data['following'] = followResults;

        // Get playlists
        const playlistQuery = 'SELECT * FROM Playlist WHERE UserID=?';
        const playlistResults = await executeQuery(playlistQuery, [userId]);
        data['playlists'] = playlistResults;

        return data;
    } catch (err) {
        throw new Error(`Error in getListenerBaseData: ${err.message}`);
    }
};
async function getAdmin(sessionData, res) {
    try {
        if (getRole(sessionData) !== 'admin') {
            return;
        }

        const data = await getAdminBaseData();
        data.newartist = data['NewArtist'];
        data.newsongs = data['NewSongs'];

        res.end(JSON.stringify(data));
    } catch (error) {
        console.error(error);
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end('<h1>Internal Server Error</h1>');
    }
}


async function getListener(sessionData, res) {
    try {
        if (getRole(sessionData) !== 'listener') {
            return;
        }

        const data = await getListenerBaseData(sessionData['id']);

        const newReleasesQuery = 'SELECT AlbumID, AlbumName, ArtistName, Album.ArtistID FROM Album LEFT JOIN Artist ON Album.ArtistID = Artist.ArtistID ORDER BY ReleaseDate DESC LIMIT 10';
        const newReleasesResults = await executeQuery(newReleasesQuery);

        const forYouQuery = 'SELECT AlbumID, AlbumName, ArtistName, Album.ArtistID FROM Album LEFT JOIN Artist ON Album.ArtistID = Artist.ArtistID INNER JOIN Follow ON Album.ArtistID = Follow.ArtistID WHERE Follow.UserID=? ORDER BY ReleaseDate DESC LIMIT 10';
        const forYouResults = await executeQuery(forYouQuery, [sessionData['id']]);

        data.new_releases = newReleasesResults;
        data.for_you = forYouResults;
        data.username = sessionData['username'];

        return data;
    } catch (error) {
        console.error(error);
        return {error: "Error"};
    }
}

async function getListenerProfile(sessionData, res) {
    try {
        if (getRole(sessionData) !== 'listener') {
            return;
        }

        const data = await getListenerBaseData(sessionData.id);

        const userQuery = 'SELECT Listener.UserID, Fname, Lname, COUNT(DISTINCT Follow.ArtistID) FROM Listener LEFT JOIN Follow ON Listener.UserID = Follow.UserID WHERE Listener.UserID=? GROUP BY Listener.UserID, Fname, Lname';
        const userResults = await executeQuery(userQuery, [sessionData.id]);
        data.user = userResults[0];

        const playlistsQuery = 'SELECT PlaylistName, Listener.Fname, Listener.Lname, PlaylistID FROM Playlist LEFT JOIN Listener ON Listener.UserID = Playlist.UserID WHERE Playlist.UserID=?';
        const playlistsResults = await executeQuery(playlistsQuery, [sessionData.id]);
        data.playlists = playlistsResults;
        data.username = sessionData.username;

        return data;
    } catch (error) {
        console.error(error);
        return {error: "Error"};
    }
}

async function getArtistBaseData(artistId) {
    try {
        const data = {};

        // Get followed artists
        const albumsQuery = 'SELECT AlbumID,AlbumName FROM Album WHERE ArtistID=?';
        const albumsResults = await executeQuery(albumsQuery, [artistId]);
        data['albums'] = albumsResults;

        // Get playlists
        const followersQuery = 'SELECT Follow.UserID,Username FROM Follow,Listener WHERE Follow.ArtistID=? AND Follow.UserID=Listener.UserID';
        const followersResults = await executeQuery(followersQuery, [artistId]);
        data['followers'] = followersResults;

        return data;
    } catch(error) {
        console.error(error);
        return {error: "Error"};
    }
}

async function getArtist(sessionData) {
    try {
        if (getRole(sessionData) !== 'artist') {
            return;
        }

        const data = await getArtistBaseData(sessionData.id);

        const myMusicQuery = 'SELECT AlbumID,AlbumName,ArtistName,Album.ArtistID FROM Album LEFT JOIN Artist ON Album.ArtistID=Artist.ArtistID WHERE Album.ArtistID=? ORDER BY ReleaseDate DESC';
        const myMusicResults = await executeQuery(myMusicQuery, [sessionData.id]);
        data.my_music = myMusicResults;

        const highestRatedAlbumsQuery = 'SELECT AlbumID,AlbumName,ArtistName,Album.ArtistID FROM Album LEFT JOIN Artist ON Album.ArtistID=Artist.ArtistID WHERE Album.ArtistID=? ORDER BY Album.AverageRating DESC LIMIT 10';
        const highestRatedAlbumsResults = await executeQuery(highestRatedAlbumsQuery, [sessionData.id]);
        data.highest_rated_albums = highestRatedAlbumsResults;

        const highestRatedSongsQuery = 'SELECT     Album.AlbumID,    Song.Name AS SongName,    Album.AlbumName,    Artist.ArtistName,    Album.ArtistID,    Song.AverageRating, Song.SongID FROM     Song JOIN     Album ON Song.AlbumID = Album.AlbumID JOIN     Artist ON Album.ArtistID = Artist.ArtistID WHERE     Album.ArtistID = ? ORDER BY     Song.AverageRating DESC LIMIT 10';
        const highestRatedSongsResults = await executeQuery(highestRatedSongsQuery, [sessionData.id]);
        data.highest_rated_songs = highestRatedSongsResults;

        const mostPlayedAlbumsQuery = 'SELECT      Album.AlbumID,     AlbumName,     ArtistName,     Album.ArtistID,     COUNT(ListenedToHistory.UserID) AS PlayCount FROM      Album JOIN      Song ON Album.AlbumID = Song.AlbumID JOIN      Artist ON Album.ArtistID = Artist.ArtistID LEFT JOIN      ListenedToHistory ON Song.SongID = ListenedToHistory.SongID WHERE      Album.ArtistID = ? GROUP BY      Album.AlbumID, AlbumName, ArtistName, Album.ArtistID ORDER BY      PlayCount DESC  LIMIT 10';
        const mostPlayedAlbumsResults = await executeQuery(mostPlayedAlbumsQuery, [sessionData.id]);
        data.most_played_albums = mostPlayedAlbumsResults;

        const mostPlayedSongsQuery = 'SELECT      Album.AlbumID,     AlbumName,     ArtistName,     Album.ArtistID,     COUNT(ListenedToHistory.UserID) AS PlayCount, Song.Name AS SongName FROM      Album JOIN      Song ON Album.AlbumID = Song.AlbumID JOIN      Artist ON Album.ArtistID = Artist.ArtistID LEFT JOIN      ListenedToHistory ON Song.SongID = ListenedToHistory.SongID WHERE      Album.ArtistID = ? GROUP BY      Album.AlbumID, AlbumName, ArtistName, SongName, Album.ArtistID ORDER BY      PlayCount DESC  LIMIT 10';
        const mostPlayedSongsResults = await executeQuery(mostPlayedSongsQuery, [sessionData.id]);
        data.most_played_songs = mostPlayedSongsResults;

        data.username = sessionData.username;

        return data;
    } catch (error) {
        console.error(error);
        return {error: "Error"};
    }
}

// Create HTTP server
const server = http.createServer(async (req, res) => {

    let rawCookies = req.headers.cookie;
    if(rawCookies === undefined) {
        rawCookies = "";
    }
    const parsedCookies = cookie.parse(rawCookies);
    const sessionToken = parsedCookies['session'];
    let sessionData = parseToken(sessionToken);

    const parsedUrl = url.parse(req.url);
    const params = querystring.parse(parsedUrl.query);

    // print(sessionData);

    // html of the homepage
    if (req.url === '/') {
        if(getRole(sessionData) === 'listener') {
            serveStaticFile(res, "./templates/listener.html", "");
            return;
        } else if(getRole(sessionData) === 'artist') {
            serveStaticFile(res, "./templates/artist.html", "");
            return;
        }
        else if(getRole(sessionData) === 'admin'){
            serveStaticFile(res, "./templates/admin.html", "");
            return;
        }

        serveStaticFile(res, './templates/index.html', 'text/html');
    } else if(req.url === '/ajax') {
        if(getRole(sessionData) === 'listener') {
            res.end(JSON.stringify(await getListener(sessionData, res)));
            return;
        } else if(getRole(sessionData) === 'artist') {
            res.end(JSON.stringify(await getArtist(sessionData, res)));
            return;
        }

        res.writeHead(404);
        res.end('Not Found');

    } else if (matchUrl(req.url, '/profile') && req.method === 'GET') {
        if(getRole(sessionData) === 'listener') {
            serveStaticFile(res, "./templates/profile_listener.html", "");
            return;
        }

        res.writeHead(404);
        res.end('Not Found');
    } else if (matchUrl(req.url, '/ajax/profile') && req.method === 'GET') {
        if(getRole(sessionData) === 'listener') {
            res.end(JSON.stringify(await getListenerProfile(sessionData, res)));
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
    else if(req.url === "/topbar"){
        if(getRole(sessionData) === 'listener') {
            let html = `<div class="topbar">
            <ul class="topbar_navigation">
                <li>
                    <a href="/">
                        <span>Hello ${sessionData.username}!</span>
                    </a>
                </li>
                <li>
                    <a href="/profile">
                        <span>Profile</span>
                    </a>
                </li>
                <li>
                    <a href="">
                        <span>Recommendations</span>
                    </a>
                </li>
                <li>
                    <a href="/history">
                        <span>Listen History</span>
                    </a>
                </li>
            </ul>
            <div class="search">
                <form action='/search'>
                    <input type="text" class="search_bar" name='query' placeholder="Search Music...">
                    <button type="submit" class="search_btn">Search</button>
                </form>
            </div>
            <ul class="topbar_navigation">
                <li>
                    <a href="/logout">
                        <span>Log Out</span>
                    </a>
                </li>
            </ul>`;
            res.end(html);
        } else if(getRole(sessionData) === 'artist') {
            let html = `<div class="topbar">
                <ul class="topbar_navigation">
                    <li>
                        <a href="/">
                            <span>Hello ${sessionData.username}!</span>
                        </a>
                    </li>
                    <li>
                        <a href="/profile">
                            <span>Profile</span>
                        </a>
                    </li>
                    <li>
                        <a href="">
                            <span>My Music</span>
                        </a>
                    </li>
                    <li>
                        <a href="">
                            <span>Artist Insights</span>
                        </a>
                    </li>
                    <li>
                        <a href="/album/create">
                            <span>Publish Album</span>
                        </a>
                    </li>

                </ul>
                <div class="search">
                    <form action='/search'>
                        <input type="text" class="search_bar" name='query' placeholder="Search Music...">
                        <button type="submit" class="search_btn">Search</button>
                    </form>
                </div>
                <ul class="topbar_navigation">
                <li>
                    <a href="/logout">
                        <span>Log Out</span>
                    </a>
                </li>
            </ul>`;
            res.end(html);
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    }
    else if(req.url === "/sidebar"){
        if(getRole(sessionData) === 'listener') {
            const data = await getListener(sessionData, res);
            let html = '';
            html += `<div class="logo">
                        <a href="/">
                            <img src="/logo.png" alt="Logo">
                        </a>
                    </div>
                    <div class="navigation">
                        <ul>
                            <li>
                                <a href="/">
                                    <span class="link_icon"></span>
                                    <span>Home</span>
                                </a>
                            </li>
                            <li>
                                <a href="">
                                    <span class="link_icon"></span>
                                    <span>Search</span>
                                </a>
                            </li>
                        </ul>
                    </div>

                    <div class="navigation">
                        <ul>
                            <li>
                                <a href="">
                                    <span class="link_icon"></span>
                                    <span>My Playlists</span>
                                </a>
                                <a href="/playlist/create" class="add_playlist">+</a>
                                <ul class="list_container">`;
                                for(const playlist of data.playlists) {
                                    html += `<li>
                                        <img src="/playlist/${playlist['PlaylistID']}/pic" alt="${playlist['PlaylistName']}">
                                        <a href="/playlist/${playlist['PlaylistID']}">${playlist['PlaylistName']}</a>
                                    </li>`;
                                }
                                html += `</ul>
                            </li>
                        </ul>
                    </div>

                    <div class="navigation">
                        <ul>
                            <li>
                                <a href="">
                                    <span class="link_icon"></span>
                                    <span>Followed Artists</span>
                                </a>
                                <ul class="list_container">`;
                                for(const follow of data.following) {
                                    html += `<li>
                                        <img src="/artist/${follow['ArtistID'] }/pic">
                                        <a href='/artist/${follow['ArtistID']}'>${follow['ArtistName']}</a>
                                    </li>`;
                                }
                                    html += `
                                </ul>
                            </li>
                        </ul>
                    </div>`;
            res.end(html);
        } else if(getRole(sessionData) === 'artist') {
            const data = await getArtist(sessionData, res);
            let html = '';
            html += `<div class="logo">
                    <a href="">
                        <img src="/logo.png" alt="Logo">
                    </a>
                </div>
                <div class="navigation">
                    <ul>
                        <li>
                            <a href="">
                                <span class="link_icon"></span>
                                <span>Home</span>
                            </a>
                        </li>
                        <li>
                            <a href="">
                                <span class="link_icon"></span>
                                <span>Search</span>
                            </a>
                        </li>
                    </ul>
                </div>

                <div class="navigation">
                    <ul>
                        <li>
                            <a href="">
                                <span class="link_icon"></span>
                                <span>My Music</span>
                            </a>
                            <a href="/album/create" class="add_album">+</a>
                            <ul class="list_container">`;
                            for(const album of data.albums) {
                                html += `<li>
                                    <img src="/album/${album['AlbumID']}/pic" alt="${album['AlbumName']}">
                                    <a href='/album/${album['AlbumID']}'>${album['AlbumName']}</a>
                                </li>`;
                            }
                            html += `</ul>
                        </li>
                        <!-- <li>
                            <a href="">
                                <span class="link_icon"></span>
                                <span>Publish Album</span>
                            </a>
                        </li> -->
                    </ul>
                </div>

                <div class="navigation">
                    <ul>
                        <li>
                            <a href="">
                                <span class="link_icon"></span>
                                <span>Followers</span>
                            </a>
                            <ul class="list_container">`;
                            for(const follow of data.followers) {
                                html += `<li>
                                    <!-- <img src="/artist/{{ follow[1] }}/pic"> -->
                                    <span>${follow['Username']}</span>
                                </li>`;
                            }
                            html += `</ul>
                        </li>
                    </ul>
                </div>`;
            res.end(html);
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
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
        if (role === undefined) {
            role = 'listener';
        }

        const form = new Types.IncomingForm();

        try {
            const [fields, files] = await new Promise((resolve, reject) => {
                form.parse(req, (err, fields, files) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve([fields, files]);
                    }
                });
            });

            if (role === 'listener') {
                query = 'SELECT UserID FROM Listener WHERE Username=? AND Password=?';
                vals = [fields['username'], fields['password']];
            } else if (role === 'artist') {
                query = 'SELECT ArtistID FROM Artist WHERE Username=? AND Password=?';
                vals = [fields['username'], fields['password']];
            } else if (role === 'admin') {
                query = 'SELECT AdminID FROM Admin WHERE Username=? AND Password=?';
                vals = [fields['username'], fields['password']];
            } else {
                res.writeHead(404);
                res.end('Not found');
                return;
            }

            const results = await executeQuery(query, vals);

            if (results.length > 0) {
                const sessionData = {};
                if (role === 'listener') {
                    sessionData['id'] = results[0]['UserID'];
                } else if (role === 'artist') {
                    sessionData['id'] = results[0]['ArtistID'];
                } else if (role === 'admin') {
                    sessionData['id'] = results[0]['AdminID'];
                }

                sessionData['role'] = role;
                sessionData['logged_in'] = true;
                sessionData['username'] = fields['username'];

                res.setHeader('Set-Cookie', `session=${createToken(sessionData)}; HttpOnly`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'Login successful' }));
            } else {
                // No matching user found
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Login failed' }));
            }
        } catch (error) {
            console.error('Error handling login:', error);
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end('<h1>Internal Server Error</h1>');
        }
    } 

    else if(matchUrl(req.url, '/register') && req.method === 'POST') {

        const form = new Types.IncomingForm();
        const fields = await new Promise((resolve, reject) => {
            form.parse(req, (err, fields) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(fields);
                }
            });
        });

        let query, vals, result_query;
        let role = params['role']

        if (role === 'listener') {
            query = 'INSERT INTO Listener (Fname, Lname, Email, DOB, Username, Password, Pnumber) VALUES (?, ?, ?, ?, ?, ?, ?)';
            vals = [fields.first, fields.last, fields.email, fields.DOB, fields.username, fields.password, fields.pnum]
            result_query = "SELECT * FROM Listener WHERE UserID = LAST_INSERT_ID()"
        } 
        else if(role === 'artist') {
            query = 'INSERT INTO Artist (ArtistName, Email, DOB, UserName, Password, Pnumber) VALUES (?, ?, ?, ?, ?, ?)';
            vals = [fields.name, fields.email, fields.DOB, fields.username, fields.password, fields.pnum]
            result_query = "SELECT * FROM Artist WHERE ArtistID = LAST_INSERT_ID()"
        }
        else {
            console.log("If statement failed")
            res.writeHead(404);
            res.end('Not found');
            return;
        }

        await executeQuery(query, vals);
        const results = await executeQuery(result_query);


        if (results.length > 0) {
            const sessionData = {};
            if (role === 'listener') {
                sessionData['id'] = results[0]['UserID'];
            } 
            else if (role === 'artist') {
                sessionData['id'] = results[0]['ArtistID'];
            }

            sessionData['role'] = role;
            sessionData['logged_in'] = true;
            sessionData['username'] = fields['username'];

            res.setHeader('Set-Cookie', `session=${createToken(sessionData)}; HttpOnly`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Registration successful' }));
        } else {
            // No matching user found
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Registration failed' }));
        }
    }

    else if(matchUrl(req.url, '/logout') && req.method === 'GET') {
        sessionData = {};
        res.setHeader('Set-Cookie', `session=${createToken(sessionData)}; HttpOnly`);
        // res.writeHead(302, { Location: '/' });
        res.end();
    } 
    else if (matchUrl(req.url, '/edit') && req.method =='GET'){
        serveStaticFile(res, './templates/listener_edit.html', "");
    }
    // Serve Edit Profile Page
    else if (matchUrl(req.url, '/ajax/edit') && req.method =='GET') {
        if (getRole(sessionData) === 'listener') {
            try {
                const data = await getListenerBaseData(sessionData.id);
                
                const userProfileQuery = 'SELECT Username, Email, Fname, Lname FROM Listener WHERE UserID=?';
                const vals = [sessionData['id']];
                
                const results = await executeQuery(userProfileQuery, vals);

                if (results.length === 0) {
                    throw new Error('User not found');
                }

                // Store Query Results
                data.email = results[0]['Email'];
                data.Fname = results[0]['Fname'];
                data.Lname = results[0]['Lname'];
                console.log(data.email);

                data.username = sessionData.username;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(data));
            } catch (error) {
                console.error('Error fetching data:', error);
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end('<h1>Internal Server Error</h1>');
            }
        } else {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end('Not found');
        }
    } else if(matchUrl(req.url, '/history') && req.method === "GET"){
        try {
            if (getRole(sessionData) !== 'listener') {
                res.writeHead(401);
                res.end('<h1>Unauthorized</h1>');
            } else {
                const data = await getListenerBaseData(sessionData.id);
                data.username = sessionData.username;

                serveStaticFile(res, './templates/listener_history.html', '');
            }
        } catch (error) {
            console.error('Error processing listener data:', error);
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end('<h1>Internal Server Error</h1>');
        }
    }
    else if (matchUrl(req.url, '/history') && req.method === 'POST') {
        try {
            if (getRole(sessionData) !== 'listener') {
                res.writeHead(401);
                res.end('<h1>Unauthorized</h1>');
            } else {
                const data = await getListenerBaseData(sessionData.id);
                
                const form = new Types.IncomingForm();
                const fields = await new Promise((resolve, reject) => {
                    form.parse(req, (err, fields) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(fields);
                        }
                    });
                });

                let selectClause = 'SELECT DISTINCT Song.Name AS SongName, ArtistName, AlbumName, DateAccessed, Genre.Name AS GenreName ';
                let conditions = [];

                selectClause = selectClause.replace(/,\s*$/, '');

                // Build the SQL query based on the form fields
                let query = selectClause + 'FROM ListenedToHistory, Artist, Song, Album, Genre WHERE ';

                let vals = [];
                if (fields.beginDate) {
                    conditions.push(`DateAccessed >= ?`);
                    vals.push(`${fields.beginDate} 00:00:00`);
                }

                if (fields.endDate) {
                    conditions.push(`DateAccessed <= ?`);
                    vals.push(`${fields.endDate} 23:59:59`);
                }

                if (fields.artist) {
                    conditions.push(`ArtistName LIKE ?`);
                    vals.push(`%${fields.artist}%`);
                }

                if (fields.album) {
                    conditions.push(`AlbumName LIKE ?`);
                    vals.push(`%${fields.album}%`);
                }

                if (fields.genre) {
                    conditions.push(`Song.GenreCode = ?`);
                    vals.push(fields.genre);
                }

                // Join the conditions with 'AND' and complete the query
                if (conditions.length === 0) {
                    query = 'SELECT DISTINCT Song.Name AS SongName, ArtistName, AlbumName, DateAccessed, Genre.Name AS GenreName FROM ListenedToHistory, Artist, Song, Album, Genre WHERE UserID=? AND ListenedToHistory.SongID=Song.SongID AND Song.AlbumID=Album.AlbumID AND Artist.ArtistID=Album.ArtistID AND Song.GenreCode=Genre.GenreCode';
                } else {
                    query += conditions.join(' AND ');
                    query += ' AND UserID=? AND ListenedToHistory.SongID=Song.SongID AND Song.AlbumID=Album.AlbumID AND Artist.ArtistID=Album.ArtistID AND Song.GenreCode=Genre.GenreCode';
                }

                // Add UserID to the values array
                vals.push(sessionData['id']);

                // Execute the query
                const results = await executeQuery(query, vals);

                // Change the column name and format the date
                results.forEach((result) => {
                    result['Song Name'] = result.SongName;
                    delete result.SongName;
                    result['Genre Name'] = result.GenreName;
                    delete result.GenreName;
                    result['Artist Name'] = result.ArtistName;
                    delete result.ArtistName;
                    result['Album Name'] = result.AlbumName;
                    delete result.AlbumName;
                    const date = new Date(result.DateAccessed);
                    const formattedDate = date.toISOString().split('T')[0];
                    result['Date Accessed'] = formattedDate;
                    delete result.DateAccessed;
                });

                // Send the results as JSON to the client
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(results));
            }
        } catch (error) {
            console.error('Error processing listener history:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal Server Error' }));
        }
    } else if(req.url === '/pic' && req.method === 'GET') {
        try {
            if (getRole(sessionData) !== 'listener') {
                res.writeHead(401);
                res.end('<h1>Unauthorized</h1>');
            } else {
                const query = 'SELECT ProfilePic FROM Listener WHERE UserID=?';
                const vals = [sessionData['id']];

                const results = await executeQuery(query, vals);

                if (!results[0] || results[0]['ProfilePic'] === null) {
                    res.writeHead(302, { Location: '/logo.png' });
                    res.end();
                    return;
                }

                const profilePic = results[0]['ProfilePic'];
                const type = fileTypeFromBuffer(profilePic);

                res.writeHead(200, { 'Content-Type': type });
                res.end(profilePic);
            }
        } catch (error) {
            console.error('Error processing profile picture:', error);
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end('<h1>Internal Server Error</h1>');
        }
    } else if(matchUrl(req.url, '/artist/([0-9]+)/follow') && req.method === 'GET') {
        try {
            if (getRole(sessionData) !== 'listener') {
                res.writeHead(401, { 'Content-Type': 'text/plain' });
                res.end("You are not authorized to do that");
                return;
            }

            const artistId = req.url.split('/')[2];

            // Check if the user is already following the artist
            const followQuery = 'SELECT * FROM Follow WHERE ArtistID=? AND UserID=?';
            const followResult = await executeQuery(followQuery, [artistId, sessionData.id]);

            if (followResult.length > 0) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end("You are already following this artist");
                return;
            }

            // Follow the artist
            const insertQuery = 'INSERT INTO Follow (UserID, ArtistID) VALUES (?, ?)';
            await executeQuery(insertQuery, [sessionData.id, artistId]);

            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end("Successfully followed");
        } catch (error) {
            console.error('Error processing follow request:', error);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end("Internal Server Error");
        }
    } else if(matchUrl(req.url, '/song/([0-9]+)/rate') && req.method === 'POST') {
        try {
            const songId = req.url.split('/')[2];

            // Create a new formidable form
            const form = new Types.IncomingForm();

            // Parse form data
            const fields = await new Promise((resolve, reject) => {
                form.parse(req, (err, fields) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(fields);
                    }
                });
            });

            // Check if 'rating' is in the form data
            if (!('rating' in fields)) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end("Specify the rating in the form please");
                return;
            }

            // Check if the user has already rated the song
            const selectQuery = 'SELECT * FROM Rating WHERE SongID=? AND UserID=?';
            const selectResult = await executeQuery(selectQuery, [songId, sessionData.id]);

            if (selectResult.length > 0) {
                // Update the existing rating
                const updateQuery = 'UPDATE Rating SET Value=? WHERE SongID=? AND UserID=?';
                await executeQuery(updateQuery, [fields.rating, songId, sessionData.id]);
            } else {
                // Insert a new rating
                const insertQuery = 'INSERT INTO Rating (UserID, SongID, Value) VALUES (?, ?, ?)';
                await executeQuery(insertQuery, [sessionData.id, songId, fields.rating]);
            }

            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end("Successfully rated song");
        } catch (error) {
            console.error('Error rating song:', error);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end("Internal Server Error");
        }
    } else if(matchUrl(req.url, '/artist/([0-9]+)/unfollow') && req.method === 'GET') {
        try {
            if (getRole(sessionData) !== 'listener') {
                res.writeHead(401, { 'Content-Type': 'text/plain' });
                res.end("You are not authorized to do that");
                return;
            }

            const artistId = req.url.split('/')[2];

            // Check if the user is following the artist
            const followQuery = 'SELECT * FROM Follow WHERE ArtistID=? AND UserID=?';
            const followResult = await executeQuery(followQuery, [artistId, sessionData.id]);

            if (followResult.length === 0) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end("You are not following this artist");
                return;
            }

            // Unfollow the artist
            const deleteQuery = 'DELETE FROM Follow WHERE ArtistID=? AND UserID=?';
            await executeQuery(deleteQuery, [artistId, sessionData.id]);

            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end("Successfully unfollowed");
        } catch (error) {
            console.error('Error unfollowing artist:', error);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end("Internal Server Error");
        }
    } else if(matchUrl(req.url, '/artist/([0-9]+)/pic') && req.method === 'GET') {
        try {
            const artistId = req.url.split('/')[2];
            const query = 'SELECT ProfilePic FROM Artist WHERE ArtistID=?';
            const vals = [artistId];
            
            const results = await executeQuery(query, vals);

            if (results.length === 0) {
                res.writeHead(302, { Location: '/logo.png' });
                res.end();
                return;
            }

            const profilePic = results[0]['ProfilePic'];

            if (profilePic === null || profilePic === undefined) {
                res.writeHead(302, { Location: '/logo.png' });
                res.end();
                return;
            }

            const type = fileTypeFromBuffer(profilePic);

            res.writeHead(200, { 'Content-Type': type });
            res.end(profilePic);
        } catch (error) {
            console.error(error);
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end('<h1>Internal Server Error</h1>');
        }
    }
    else if (matchUrl(req.url, '/album/([0-9]+)') && req.method === 'GET'){
        serveStaticFile(res, './templates/album.html', "");
    }
    // Serve Page for an Album 
    else if (matchUrl(req.url, '/ajax/album/([0-9]+)') && req.method === 'GET') {
        try {
            let data = {};
            if (getRole(sessionData) === 'listener') {
                data = await getListenerBaseData(sessionData.id);
            } else if (getRole(sessionData) === 'artist') {
                data = await getArtistBaseData(sessionData.id);
            }

            const albumId = req.url.split('/')[3];

            const albumQuery = 'SELECT AlbumID, AlbumName, Album.ArtistID, AlbumDuration, ReleaseDate, ArtistName FROM Album, Artist WHERE AlbumID=? AND Album.ArtistID=Artist.ArtistID';
            const albumResults = await executeQuery(albumQuery, [albumId]);

            if (albumResults.length === 0) {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('Album not found');
                return;
            }

            data.albumData = albumResults[0];

            // Calculate Album Duration in Minutes and Seconds
            const duration_min = Math.floor(data.albumData['AlbumDuration'] / 60);
            const duration_sec = Math.floor(data.albumData['AlbumDuration'] % 60);

            data.album_duration = `${duration_min} min ${duration_sec} sec`;

            // Format Release Date to MM/DD/YYYY
            const releaseDate = new Date(data.albumData['ReleaseDate']);
            data.formattedReleaseDate = releaseDate.toLocaleDateString();

            const songQuery = 'SELECT ROW_NUMBER() OVER (ORDER BY SongID) row_num, Song.Name, Duration, ArtistName, Artist.ArtistID, Song.SongID FROM Song, Artist, Album WHERE Song.AlbumID=Album.AlbumID AND Album.ArtistID=Artist.ArtistID AND Album.AlbumID=?';
            const songResults = await executeQuery(songQuery, [albumId]);

            if (songResults.length === 0) {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end(JSON.stringify(data));
                return;
            }

            data.songData = songResults.map((song) => {
                const duration_min = Math.floor(song.Duration / 60);
                const duration_sec = Math.floor(song.Duration % 60);
                const duration_str = `${duration_min}:${duration_sec}`;

                return {
                    count: song.row_num,
                    songName: song.Name,
                    Duration: duration_str,
                    artistName: song.ArtistName,
                    artistID: song.ArtistID,
                    songID: song.SongID
                };
            });

            // Get AristID from previous query
            const artistID = data.albumData['ArtistID'];

            const moreByQuery = 'SELECT Artist.ArtistID, ArtistName, AlbumID, AlbumName FROM Album, Artist WHERE Album.ArtistID = Artist.ArtistID AND Album.ArtistID = ? AND Album.AlbumID != ? ORDER BY ReleaseDate DESC LIMIT 10';
            const moreByValues = [artistID, albumId];

            const moreByResults = await executeQuery(moreByQuery, moreByValues);
            data.more_by = moreByResults;

            if(getRole(sessionData) === 'artist') {
                data.playlists = [];
            }

            data.username = sessionData.username;
            res.writeHead(200);
            res.end(JSON.stringify(data));
        } catch (error) {
            console.error('Error fetching album data:', error);
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end('<h1>Internal Server Error</h1>');
        }
    } else if(matchUrl(req.url, '/album/([0-9]+)/pic') && req.method === 'GET') {
        try {
            const albumId = req.url.split('/')[2];

            const query = 'SELECT AlbumPic FROM Album WHERE AlbumID=?';
            const results = await executeQuery(query, [albumId]);

            if (results.length === 0 || results[0]['AlbumPic'] === null || results[0]['AlbumPic'] === undefined) {
                res.writeHead(302, { Location: '/logo.png' });
                res.end();
                return;
            }

            const albumPic = results[0]['AlbumPic'];
            const type = fileTypeFromBuffer(albumPic);

            res.writeHead(200, { 'Content-Type': type });
            res.end(albumPic);
        } catch (error) {
            console.error('Error fetching album pic:', error);
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end('<h1>Internal Server Error</h1>');
        }
    } else if(matchUrl(req.url, '/playlist/([0-9]+)') && req.method === 'GET') {
        if(getRole(sessionData) === 'listener') {
            serveStaticFile(res, './templates/playlist.html', "");
        }
    } else if(matchUrl(req.url, '/playlist/([0-9]+)/add/([0-9]+)') && req.method === 'GET') {
        const playlistId = req.url.split('/')[2];
        const songId = req.url.split('/')[4];
        if (getRole(sessionData) !== 'listener') {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end("You are not authorized to do that");
            return;
        }

        try {
            const result = await executeQuery('SELECT SongID, PlaylistID FROM PlaylistSong WHERE PlaylistID=? AND SongID=?', [playlistId, songId]);
            if(result.length > 0) {
                res.end("Song has already been added to this playlist");
                return;
            }

            await executeQuery('INSERT INTO PlaylistSong (PlaylistID, SongID) VALUES (?,?)', [playlistId, songId]);

            res.end("Song successfully added to playlist");

        } catch(error) {
            console.error(error);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end("Internal Server Error");
        }
    } else if(matchUrl(req.url, '/playlist/([0-9]+)/remove/([0-9]+)') && req.method === 'GET') {
        const playlistId = req.url.split('/')[2];
        const songId = req.url.split('/')[4];
        if (getRole(sessionData) !== 'listener') {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end("You are not authorized to do that");
            return;
        }

        try {
            const result = await executeQuery('SELECT SongID, PlaylistID FROM PlaylistSong WHERE PlaylistID=? AND SongID=?', [playlistId, songId]);
            if(result.length === 0) {
                res.end("Song is not in this playlist");
                return;
            }

            await executeQuery('DELETE FROM PlaylistSong WHERE PlaylistID=? AND SongID=?', [playlistId, songId]);

            res.end("Song successfully removed from playlist");

        } catch(error) {
            console.error(error);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end("Internal Server Error");
        }

    } else if(matchUrl(req.url, '/ajax/playlist/([0-9]+)') && req.method === 'GET') {
        const playlistId = req.url.split('/')[3];

        if (getRole(sessionData) !== 'listener') {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end("You are not authorized to do that");
            return;
        }

        try {
            const data = await getListenerBaseData(sessionData.id);

            // Get playlist details
            const playlistQuery = 'SELECT PlaylistID, PlaylistName, PlaylistDuration FROM Playlist WHERE PlaylistID=?';
            const playlistResult = await executeQuery(playlistQuery, [playlistId]);

            data.playlist = playlistResult[0];
            data.username = sessionData['username'];

            const duration_min = Math.floor(data.playlist['PlaylistDuration'] / 60);
            const duration_sec = Math.floor(data.playlist['PlaylistDuration'] % 60);

            data.playlist_duration = `${duration_min} min ${duration_sec} sec`;

            // Get songs in the playlist
            const playlistSongsQuery = 'SELECT ROW_NUMBER() OVER (ORDER BY PlaylistSong.SongID) row_num, Name, ArtistName, Duration, Song.SongID FROM Song, PlaylistSong, Artist, Album WHERE Song.SongID=PlaylistSong.SongID AND PlaylistSong.PlaylistID=? AND Song.AlbumID=Album.AlbumID AND Album.ArtistID=Artist.ArtistID';
            const playlistSongsResult = await executeQuery(playlistSongsQuery, [playlistId]);

            data.songs = playlistSongsResult.map(song => {
                const duration_min = Math.floor(song.Duration / 60);
                const duration_sec = song.Duration % 60;
                const duration_str = `${duration_min}:${duration_sec}`;
                return [song.row_num, song.Name, song.ArtistName, song.Duration, duration_str, song.SongID];
            });

            // Get recommended songs
            const recommendedSongsQuery = 'SELECT DISTINCT Name, ArtistName, Song.SongID, Artist.ArtistID, Album.AlbumID FROM Song, PlaylistSong, Artist, Album WHERE PlaylistID=? AND Song.AlbumID=Album.AlbumID AND Album.ArtistID=Artist.ArtistID AND GenreCode IN (SELECT DISTINCT GenreCode FROM Song, PlaylistSong WHERE PlaylistID=? AND Song.SongID=PlaylistSong.SongID) LIMIT 10';
            const recommendedSongsResult = await executeQuery(recommendedSongsQuery, [playlistId, playlistId]);

            data.recommended = recommendedSongsResult;



            res.end(JSON.stringify(data));
        } catch (error) {
            console.error(error);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end("Internal Server Error");
        }

    } else if(matchUrl(req.url, '/playlist/([0-9]+)/pic') && req.method === 'GET') {
        const playlistId = req.url.split('/')[2];

        try {
            const query = 'SELECT AlbumPic FROM Album, PlaylistSong, Song WHERE PlaylistSong.SongID=Song.SongID AND Song.AlbumID=Album.AlbumID AND PlaylistID=?';
            const vals = [playlistId];
            
            const results = await executeQuery(query, vals);

            if (results.length === 0) {
                res.writeHead(302, { location: '/logo.png' });
                res.end();
                return;
            }

            const albumPic = results[0]['AlbumPic'];

            if (albumPic === null || albumPic === undefined) {
                res.writeHead(302, { location: '/logo.png' });
                res.end();
                return;
            }

            const type = fileTypeFromBuffer(albumPic);

            res.writeHead(200, { 'Content-Type': type });
            res.end(albumPic);
        } catch (error) {
            console.error(error);
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end('<h1>Internal Server Error</h1>');
        }
    } else if(matchUrl(req.url, '/playlist/create') && req.method === 'GET') {
        if(getRole(sessionData) !== 'listener') {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end("You are not authorized to do that");
            return;
        }

        serveStaticFile(res, './templates/create_playlist.html', "");
    } else if(matchUrl(req.url, '/playlist/create') && req.method === 'POST') {
        try {
            if (getRole(sessionData) !== 'listener') {
                res.writeHead(401, { 'Content-Type': 'text/plain' });
                res.end("You are not authorized to do that");
                return;
            }

            const form = new Types.IncomingForm();

            // Promisify form parsing
            const parseFormAsync = () => {
                return new Promise((resolve, reject) => {
                    form.parse(req, (err, fields) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(fields);
                        }
                    });
                });
            };

            const fields = await parseFormAsync();

            // Check if 'playlistname' is in the form data
            if (!('playlistname' in fields)) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end("Specify the playlist name in the form please");
                return;
            }

            const insertQuery = 'INSERT INTO Playlist (UserID, PlaylistName) VALUES (?, ?)';
            await executeQuery(insertQuery, [sessionData.id, fields['playlistname']]);

            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end("Successfully created playlist");
        } catch (error) {
            console.error('Error creating playlist:', error);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end("Internal Server Error");
        }
    } else if(matchUrl(req.url, '/song/([0-9]+)') && req.method === 'GET') {
        try {
            const songId = req.url.split('/')[2];
            const query = 'SELECT SongID, Song.AlbumID, Name, AlbumName FROM Song, Album WHERE SongID=? AND Album.AlbumID=Song.AlbumID';
            const vals = [songId];

            const results = await executeQuery(query, vals);

            if (results.length === 0) {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('Not found');
                return;
            }

            const songInfo = results[0];

            res.writeHead(200);
            res.end(JSON.stringify({ "albumid": songInfo['AlbumID'], "songname": songInfo['Name'], "artistname": songInfo['AlbumName'] }));
        } catch (error) {
            console.error('Error getting song information:', error);
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end('<h1>Internal Server Error</h1>');
        }
    } else if(matchUrl(req.url, '/song/([0-9]+)/audio') && req.method === 'GET') {
        try {
            const songId = req.url.split('/')[2];
            const query = 'SELECT SongFile,Duration FROM Song WHERE SongID=?';
            const vals = [songId];

            const results = await executeQuery(query, vals);

            if (results.length === 0) {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('Not found');
                return;
            }

            const songFile = results[0]['SongFile'];

            if (songFile === null || songFile === undefined) {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('Not found');
                return;
            }

            const type = fileTypeFromBuffer(songFile);

            // add to the listen history. full duration of the song for now
            if(getRole(sessionData) === 'listener') {
                await executeQuery('INSERT INTO ListenedToHistory (SongID,UserID,Duration) VALUES (?,?,?)', [songId, sessionData.id, results[0]['Duration']]);
            }

            res.writeHead(200, { 'Content-Type': type });
            res.end(songFile);
        } catch (error) {
            console.error('Error getting song file:', error);
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end('<h1>Internal Server Error</h1>');
        }
    } else if (matchUrl(req.url, '/album/create') && req.method === 'GET') {
        if(getRole(sessionData) !== 'artist') {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end("You are not authorized to do that");
            return;
        }

        serveStaticFile(res, './templates/create_al.html', "");
    } else if (matchUrl(req.url, '/genres') && req.method === 'GET') {
        try {
            const results = await executeQuery('SELECT Name FROM Genre');

            const genres = results.map(genre => genre['Name']);
            res.writeHead(200);
            res.end(JSON.stringify(genres));
        } catch (error) {
            throw error;
        }
    } else if (matchUrl(req.url, '/album/create') && req.method === 'POST') {
        if (getRole(sessionData) !== 'artist') {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end("You are not authorized to do that");
            return;
        }

        const form = new Types.IncomingForm({ multiples: true });

        try {
            const { fields, files } = await parseFormAsync(form, req);

            const albumCover = await readFile(files.albumCover.filepath);

            const albumId = await executeQuery('INSERT INTO Album (AlbumName, AlbumPic, ArtistID, ReleaseDate) VALUES (?,?,?,?)',
                [fields.albumName, albumCover, sessionData.id, fields.releaseDate]);

            const songPromises = [];
            for (let i = 0; i < fields.songNames.length; i++) {
                const songAudio = await readFile(files['songs[]'][i].filepath);
                const duration = await getAudioDurationInSeconds(files['songs[]'][i].filepath);

                const genreResults = await executeQuery('SELECT GenreCode FROM Genre WHERE Name=?', [fields.songGenres[i]]);

                if (genreResults.length === 0) {
                    throw new Error(`Genre not found for song ${fields.songNames[i]}`);
                }

                const genreCode = genreResults[0]['GenreCode'];

                songPromises.push(executeQuery('INSERT INTO Song (Name, GenreCode, AlbumID, SongFile, Duration, ReleaseDate) VALUES (?, ?, ?, ?, ?, ?)',
                    [fields.songNames[i], genreCode, albumId, songAudio, duration, fields.releaseDate]));
            }

            // Wait for all songs to be uploaded before responding
            await Promise.all(songPromises);

            res.writeHead(200);
            res.end("Successfully uploaded album");

            // Remove album cover file after upload
            await removeFile(files.albumCover.filepath);
        } catch (error) {
            console.error('Error uploading album:', error);
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end(`<h1>Internal Server Error: ${error}</h1>`);
        }
    } else {
        //print those not found and keep going with this slow slow process
        print(req.url)

        res.writeHead(404);
        res.end('Not Found');
    }
  });
  
  server.listen(80, () => {
    console.log('Server started');
  });