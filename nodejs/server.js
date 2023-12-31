import http from 'http';
import fs from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import mysql from 'mysql2/promise';
import url from 'url';
import querystring, { stringify } from 'querystring';
import cookie from 'cookie';
import { createToken, parseToken } from './session.js';
import dotenv from 'dotenv';
import Types from 'formidable';
import { Readable } from 'stream';
import { fileTypeFromBuffer } from 'file-type';
import { getAudioDurationInSeconds } from 'get-audio-duration';
import { match } from 'assert';
// import { getAdminArtist ,getAdminSong,getAdminListener} from './insights.js';
import { exec } from 'child_process';

//import nodemon from 'nodemon';

// bruh...
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Create a connection to the database
//print to the console hehe (Python)
const print = (a) => console.log(a);

let pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    idleTimeout: 20 * 1000
});

function getRole(session) {
    if (session['logged_in'] === true) {
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
function ReplaceMatchUrl(InBound, match) {
    if (InBound.replace(match, "").length != InBound.length) {
        return true
    }
    return false

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
            if ('role' in replacements) {
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



            }
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


//gets all the song counts when the Admin Logs IN 
const getAdminBaseData = async () => {
    try {
        const data = {};
        const NumArtist = await executeQuery('SELECT COUNT(*) FROM Artist');
        const NumUsers = await executeQuery('SELECT COUNT(*) FROM Listener');
        const NumSongs = await executeQuery('SELECT COUNT(*) FROM Song');
        const NumPlaylist = await executeQuery('SELECT COUNT(*) FROM Playlist'); // show all playlists including deleted ones
        data['NumArtist'] = NumArtist
        data['NumUsers'] = NumUsers
        data['NumSongs'] = NumSongs
        data['NumPlaylist'] = NumPlaylist
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
        const playlistQuery = 'SELECT * FROM Playlist WHERE UserID=? AND Deleted=0';
        const playlistResults = await executeQuery(playlistQuery, [userId]);
        data['playlists'] = playlistResults;

        return data;
    } catch (err) {
        throw new Error(`Error in getListenerBaseData: ${err.message}`);
    }
};
async function getAdmin(sessionData) {
    try {
        if (getRole(sessionData) !== 'admin') {
            return;
        }
        //got the data base
        const data = await getAdminBaseData();
        return data
    } catch (error) {
        console.error(error);
        return { error: "Error" };
    }
}
//get all the insight data
async function getAdminArtist() {
    try {
        const data = {};

        const NewArtistQuery = 'SELECT ArtistName, ProfilePic,ArtistID FROM Artist ORDER BY ArtistID ';
        const NewArtistResults = await executeQuery(NewArtistQuery);


    
        NewArtistResults.forEach(artist => {
            if (artist.ProfilePic && Buffer.isBuffer(artist.ProfilePic)) {
                // Convert the Buffer to a Base64 string
                artist.ProfilePic = artist.ProfilePic.toString('base64');
            }
        });

        data['NewArtist'] = NewArtistResults;
        return data;



    } catch (error) {
        console.error(error);
        return {error: "Error"};
    }
}
async function getAdminSong() {
    try {
        const data = {};


        const sqlQuery = `
        SELECT 
        Song.SongID AS SongID,
        Song.Name AS SongName,
        Album.ArtistID AS ArtistID,  -- Assuming Album table has ArtistID
        Artist.ArtistName AS ArtistName,
        Song.AlbumID AS AlbumID,
        Album.AlbumPic AS AlbumPic
    FROM 
        Song
    INNER JOIN Album ON Song.AlbumID = Album.AlbumID
    INNER JOIN Artist ON Album.ArtistID = Artist.ArtistID  -- Joining Artist with Album
    ORDER BY Album.ArtistID;  -- Ordering by Album's ArtistID
    
`;
        const NewSongResults = await executeQuery(sqlQuery);
        

        NewSongResults.forEach(artist => {
            if (artist.AlbumPic&& Buffer.isBuffer(artist.AlbumPic)) {
                // Convert the Buffer to a Base64 string
                artist.AlbumPic = artist.AlbumPic.toString('base64');
            }
        });

        data['NewSong'] = NewSongResults;
        return data;



    } catch (error) {
        console.error(error);
        return {error: "Error"};
    }
}
async function getAdminListener() {
    try {
        const data = {};


        const sqlQuery = `
        SELECT UserID, Username, ProfilePic
        FROM Listener
        ORDER BY UserID;
        
    
`;
        const NewSongResults = await executeQuery(sqlQuery);
        

        NewSongResults.forEach(artist => {
            if (artist.ProfilePic&& Buffer.isBuffer(artist.ProfilePic)) {
                // Convert the Buffer to a Base64 string
                artist.ProfilePic = artist.ProfilePic.toString('base64');
            }
        });

        

        data['NewListener'] = NewSongResults;
        return data;



    } catch (error) {
        console.error(error);
        return {error: "Error"};
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
        return { error: "Error" };
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

        const playlistsQuery = 'SELECT PlaylistName, Listener.Fname, Listener.Lname, PlaylistID FROM Playlist LEFT JOIN Listener ON Listener.UserID = Playlist.UserID WHERE Playlist.UserID=? AND Playlist.Deleted=0';
        const playlistsResults = await executeQuery(playlistsQuery, [sessionData.id]);
        data.playlists = playlistsResults;
        data.username = sessionData.username;

        return data;
    } catch (error) {
        console.error(error);
        return { error: "Error" };
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
    } catch (error) {
        console.error(error);
        return { error: "Error" };
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
        return { error: "Error" };
    }
}

async function getArtistProfile(sessionData, res) {
    try {
        if (getRole(sessionData) !== 'artist') {
            return;
        }

        const data = await getArtistBaseData(sessionData.id);

        const userQuery = 'SELECT Artist.ArtistID, ArtistName, COUNT(DISTINCT Follow.ArtistID) FROM Artist LEFT JOIN Follow ON Artist.ArtistID = Follow.ArtistID WHERE Artist.ArtistID=? GROUP BY Artist.ArtistID, ArtistName';
        const userResults = await executeQuery(userQuery, [sessionData.id]);
        data.user = userResults[0];

        return data;
    } catch (error) {
        console.error(error);
        return { error: "Error" };
    }
}
async function getAdminUnResolved(sessionData, res) {
    try {
        const data = {}
        const userQuery = `SELECT SongID, Name
        FROM Song
        WHERE flagged = 1 AND reviewed = 0`;
        const userResults = await executeQuery(userQuery);
        data['UnResolved'] = userResults;




        return data;
    } catch (error) {
        console.error(error);
        return { error: "Error" };
    }
}
async function getAdminResolved(sessionData, res) {
    try {
        const data = {}
        const userQuery = `SELECT SongID, Name
        FROM Song
        WHERE flagged = 1 AND reviewed = 1`;
        const userResults = await executeQuery(userQuery);
        data['Resolved'] = userResults;
        //print(data)

        return data;

    } catch (error) {
        console.error(error);
        return { error: "Error" };
    }
}
//joshie
async function getSongInfoConsider(songID) {
    try {
        const data = {}
        const userQuery = `
        SELECT 
        Song.SongFile AS SongFile,
        Song.Name AS SongName, 
        Artist.ArtistName, 
        Album.AlbumName, 
        Album.AlbumPic
    FROM 
        Song
    INNER JOIN Album ON Song.AlbumID = Album.AlbumID
    INNER JOIN Artist ON Album.ArtistID = Artist.ArtistID  -- Joining Artist with Album
    WHERE 
        Song.SongID = ?;
    
    
    `;
        const userResults = await executeQuery(userQuery, [songID]);

        userResults.forEach(artist => {
            if (artist.AlbumPic && Buffer.isBuffer(artist.AlbumPic)) {
                // Convert the Buffer to a Base64 string
                artist.AlbumPic = artist.AlbumPic.toString('base64');
            }
        });




        data['song'] = userResults;
        const type = await fileTypeFromBuffer(data['song'][0]['SongFile'])
        data['song'][0]['SongFile'] = data['song'][0]['SongFile'].toString('base64');
        //print(type)
        data['song'][0]['MimeType'] = type['mime']
        // print(data)
        //console.log(data);
        return data;

    } catch (error) {
        console.error(error);
        return { error: "Error" };
    }
}
async function KillorKeep(songID, type, res) {
    try {

        if (type === 'Keep') {


            let updateSongQuery = 'UPDATE Song SET reviewed = 1 WHERE SongID = ?';
            await executeQuery(updateSongQuery, [songID])



        }
        else if (type === "Kill") {

            //first delete all the ratings from the song
            let deleteSongQuery = 'DELETE FROM Rating WHERE SongID = ?';
            await executeQuery(deleteSongQuery, [songID])
            //then delete the song form the user flags


            deleteSongQuery = 'DELETE FROM UserFlags WHERE SongID = ?';
            await executeQuery(deleteSongQuery, [songID])


            deleteSongQuery = 'DELETE FROM Song WHERE SongID = ?';
            await executeQuery(deleteSongQuery, [songID])
        }



        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Flag inserted successfully' }));
    } catch (err) {
        console.error(err);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('An error occurred during form processing');
    }
}
async function calculateTimeDifference(notification, timeDatabase) {
    // Extracting the current time from the time_database array
    const currentTime = new Date(timeDatabase[0]['NOW()']);
    // console.log(currentTime);
    const notificationTime = new Date(notification.CreationTime);

    // Calculate the difference in milliseconds
    const diffMs = currentTime - notificationTime;
    // console.log(diffMs);

    // Convert milliseconds to minutes, hours, and days
    const diffMins = Math.floor(diffMs / 60000); // 60,000 milliseconds in a minute
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    // Determine the appropriate unit to return
    if (diffMins < 60) {
        return `${diffMins} minutes`;
    } else if (diffHours < 24) {
        return `${diffHours} hours`;
    } else {
        return `${diffDays} days`;
    }
}

async function modifyCreationTimes(data, time_database) {
    // console.log(time_database);
    const promises = data.notification.map(async (notification) => {
        // Calculate and update the CreationTime for each notification
        notification.CreationTime = await calculateTimeDifference(notification, time_database);
    });

    // Wait for all the promises to resolve
    await Promise.all(promises);
}

async function NotificationsUser(userID) {
    try {
        const data = {}
        const userQuery = `SELECT 
        Notification, 
        Reviewed,
        CreationTime
    FROM 
        NotificationUser
    WHERE 
        UserID = ?
    ORDER BY 
        CreationTime DESC; `;
        const time_database = await executeQuery('SELECT NOW();')

        const userResults = await executeQuery(userQuery, [userID]);
        data['notification'] = userResults;
        await modifyCreationTimes(data, time_database)




        //print(data)
        return data;
    } catch (error) {
        console.error(error);
        return { error: "Error" };
    }
}
async function NotificationsArtist(userID) {
    try {
        const data = {}
        const userQuery = `SELECT 
        Notification, 
        Reviewed,
        CreationTime
    FROM 
        NotificationArtist
    WHERE 
        ArtistID = ?
    ORDER BY 
        CreationTime DESC; `;
        const time_database = await executeQuery('SELECT NOW();')

        const userResults = await executeQuery(userQuery, [userID]);
        data['notification'] = userResults;
        await modifyCreationTimes(data, time_database)




        //print(data)
        return data;
    } catch (error) {
        console.error(error);
        return { error: "Error" };
    }
}

async function getnotificationCount(role, id) {
    try {
        // print(id)
        if (role === "listener") {
            const userQuery = `
            SELECT COUNT(*)
            FROM NotificationUser
            WHERE UserID = ? AND Reviewed=0
            `;
            const userResults = await executeQuery(userQuery, [id]);
            // print(userResults)

            return userResults[0]['COUNT(*)'];



        }
        else if (role === "artist") {

            const userQuery = `
            SELECT COUNT(*)
            FROM NotificationArtist
            WHERE ArtistID = ? AND Reviewed=0
            `;
            const userResults = await executeQuery(userQuery, [id]);
            print(userResults)

            return userResults[0]['COUNT(*)'];

        }
        else if (role === "admin") {
            const userQuery = `
            SELECT COUNT(*)
            FROM NotificationAdmin
            WHERE AdminID = ? AND Reviewed=0
            `;
            const userResults = await executeQuery(userQuery, [id]);
            // print(userResults)

            return userResults[0]['COUNT(*)'];

        }


    } catch (error) {
        console.error(error);
        return { error: "Error" };
    }
}
function getColorNotification(num) {
    //print(num)

    if (num >= 1) {
        return "Notification-Style"
    }
    else {
        return "Notification-Styled"
    }




}
async function review_notification_user(userID, message) {
    try {


        const userQuery = `
            UPDATE NotificationUser
            SET Reviewed = 1
            WHERE UserID = ?
            AND Notification = ?;
            `;
        const userResults = await executeQuery(userQuery, [userID, message]);


    } catch (error) {
        console.error(error);
        return { error: "Error" };
    }
}
async function review_notification_artist(userID, message) {
    try {


        const userQuery = `
            UPDATE NotificationArtist
            SET Reviewed = 1
            WHERE ArtistID = ?
            AND Notification = ?;
            `;
        const userResults = await executeQuery(userQuery, [userID, message]);


    } catch (error) {
        console.error(error);
        return { error: "Error" };
    }
}
//DeleteAlbum

async function DeleteAlbum(albumId) {
 
        // Step 1: Retrieve all song IDs for the album
        let songIds = await executeQuery('SELECT SongID FROM Song WHERE AlbumID = ?', [albumId]);
    
        for (let song of songIds) {
            let songID = song.SongID;
    
            // Step 2: Delete all ratings for the song
            await executeQuery('DELETE FROM Rating WHERE SongID = ?', [songID]);
    
            // Step 3: Delete all user flags for the song
            await executeQuery('DELETE FROM UserFlags WHERE SongID = ?', [songID]);
    
            // Step 4: Delete the song
            await executeQuery('DELETE FROM Song WHERE SongID = ?', [songID]);
        }
    
        // Step 5: Delete the album
        await executeQuery('DELETE FROM Album WHERE AlbumID = ?', [albumId]);
    
        // Handle commit, transaction or any error handling as needed
    
}
async function DataAlbumsAdmin(id)  {
    
    try {


        const userQuery = `
    SELECT
    Song.SongID,
    Song.Name AS SongName,
    Album.AlbumID,
    Album.AlbumName,
    Album.ArtistID,
    Album.ReleaseDate,
    Album.AlbumDuration,
    Album.AverageRating
FROM
    Song
INNER JOIN Album ON Song.AlbumID = Album.AlbumID
WHERE
    Album.AlbumID = ?

    `;
        const userResults = await executeQuery(userQuery, [id]);
        return userResults


    } catch (error) {
        console.error(error);
        return { error: "Error" };
    }
}
async function DataArtistAdmin(id) {

    try {


        const userQuery = `
    SELECT AlbumID, AlbumName
    FROM Album
    WHERE ArtistID = ?

    `;
        const userResults = await executeQuery(userQuery, [id]);
        print(userResults)
        return userResults


    } catch (error) {
        console.error(error);
        return { error: "Error" };
    }
}
async function getAdminSearchData(search_result, boxes_check) {
    let data = {};
    try {
        for (const item of boxes_check) {
            //console.log(search_result); // using console.log instead of print
            let userQuery = '';
            let key = '';

            switch (item) {
                case 'artist':
                    userQuery = 'SELECT ArtistID,ArtistName FROM Artist WHERE ArtistName LIKE ?';
                    key = 'artist';
                    break;
                case 'album':
                    userQuery = 'SELECT AlbumID,AlbumName FROM Album WHERE AlbumName LIKE ?';
                    key = 'album';
                    break;
                case 'song':
                    userQuery = 'SELECT SongID,Name FROM Song WHERE Name LIKE ?';
                    key = 'song';
                    break;
                case 'listener':
                    userQuery = 'SELECT UserID,Username FROM Listener WHERE Username LIKE ?';
                    key = 'listener';
                    break;
            }

            if (userQuery && key) {
                data[key] = await executeQuery(userQuery, [`%${search_result}%`]);
            }
        }
        return data;
    } catch (error) {
        console.error(error);
        return { error: "Error" };
    }
}
async function fetchSongFile(req) {
    try {
        const songId = req.url.split('/')[2];
        const query = 'SELECT SongFile, Duration, flagged, reviewed FROM Song WHERE SongID = ?';
        const vals = [songId];

        const results = await executeQuery(query, vals);

        if (results.length === 0) {
            return { error: 'Not found', statusCode: 404 };
        }

        const songFile = results[0]['SongFile'];
        const flagged = results[0]['flagged'];
        const reviewed = results[0]['reviewed'];

        if (songFile === null || songFile === undefined || (flagged === 1 && reviewed === 0)) {
            return { error: 'Not found', statusCode: 404 };
        }

        const type = await fileTypeFromBuffer(songFile);

        // Additional checks or logic here

        return { songFile, type, statusCode: 200 };
    } catch (error) {
        console.error('Error getting song file:', error);
        return { error: 'Internal Server Error', statusCode: 500 };
    }
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
    //print(req.url)
    let rawCookies = req.headers.cookie;
    if (rawCookies === undefined) {
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
        if (getRole(sessionData) === 'listener') {
            serveStaticFile(res, "./templates/listener.html", "");
            return;
        } else if (getRole(sessionData) === 'artist') {
            serveStaticFile(res, "./templates/artist.html", "");
            return;
        }
        else if (getRole(sessionData) === 'admin') {
            serveStaticFile(res, "./templates/admin.html", "");
            return;
        }

        serveStaticFile(res, './templates/index.html', 'text/html');
    } else if (req.url === '/ajax') {
        if (getRole(sessionData) === 'listener') {
            res.end(JSON.stringify(await getListener(sessionData, res)));
            return;
        } else if (getRole(sessionData) === 'artist') {
            res.end(JSON.stringify(await getArtist(sessionData, res)));
            return;
        }
        else if (getRole(sessionData) === 'admin') {
            res.end(JSON.stringify(await getAdmin(sessionData, res)));
            return;

        }

        // res.writeHead(404);
        // res.end('Not Found');
        serveStaticFile(res, "./templates/redirect_error.html", "");

    } else if (matchUrl(req.url, '/profile') && req.method === 'GET') {
        if (getRole(sessionData) === 'listener') {
            serveStaticFile(res, "./templates/profile_listener.html", "");
            return;
        } else if (getRole(sessionData) === 'artist') {
            serveStaticFile(res, "./templates/profile_artist.html", "");
            return;
        }

        // res.writeHead(404);
        // res.end('Not Found');
        serveStaticFile(res, "./templates/redirect_error.html", "");

    } else if (matchUrl(req.url, '/ajax/profile') && req.method === 'GET') {
        if (getRole(sessionData) === 'listener') {
            res.end(JSON.stringify(await getListenerProfile(sessionData, res)));
            return;
        } else if (getRole(sessionData) === 'artist') {
            res.end(JSON.stringify(await getArtistProfile(sessionData, res)));
            return;
        }

        // res.writeHead(404);
        // res.end('Not Found');
        serveStaticFile(res, "./templates/redirect_error.html", "");


    }
    //get the data 
    else if (ReplaceMatchUrl(req.url, '/admin/reported/')) {

        const Inthere = 'SELECT UserID,SongID FROM UserFlags WHERE SongID=? AND UserID =?';
        //admin/reported/UnResolved
        const request_to_serve = req.url.replace('/admin/reported/', "");
        if (request_to_serve === 'UnResolved') {

            res.end(JSON.stringify(await getAdminUnResolved(sessionData)));
        }
        else if (request_to_serve === 'Resolved') {

            res.end(JSON.stringify(await getAdminResolved(sessionData)));
        }




    }
    else if (ReplaceMatchUrl(req.url, '/admin/insights/type') && req.method === 'GET') {
        //print(req.url)

        const request_to_serve = req.url.replace('/admin/insights/type', "");

        if (request_to_serve === 'Artist') {
            res.end(JSON.stringify(await getAdminArtist()));
        }
        else if (request_to_serve === 'Song') {
            res.end(JSON.stringify(await getAdminSong()));
        }
        else if (request_to_serve === 'Listener') {
            res.end(JSON.stringify(await getAdminListener()));
        }

    }
    else if (ReplaceMatchUrl(req.url, '/admin/insights/')) {

        if (getRole(sessionData) != "admin") {
            serveStaticFile(res, "./templates/redirect_error.html", "");
            return
        }


        else {

            const profile = (req.url.replace('/admin/insights/', ""));
            serveStatic_Plus(res, "./templates/insights.html", "", { 'profile': profile })

        }
    }
    //song has been considered but can still be rejected
    else if (ReplaceMatchUrl(req.url, '/song-considered/')) {
        const SongID = req.url.replace('/song-considered/', "")

        serveStatic_Plus(res, './templates/considered_admin.html', '', { 'SongID': SongID })


    }
    //song needs to be accepted or rejects
    else if (ReplaceMatchUrl(req.url, '/song-consider/')) {
        const SongID = req.url.replace('/song-consider/', "")

        serveStatic_Plus(res, './templates/consider_admin.html', '', { 'SongID': SongID })


    }

    else if (ReplaceMatchUrl(req.url, '/getsonginfo/')) {
        const SongID = req.url.replace('/getsonginfo/', "")

        //print(SongID)
        res.end(JSON.stringify(await getSongInfoConsider(SongID)))


    }
    else if (ReplaceMatchUrl(req.url, '/considered/result/')) {
        //(req.url)

        let action = req.url.replace('/considered/result/', "")
        //keep the song forever, no more reports

        if (ReplaceMatchUrl(action, 'accept/')) {
            var songID = action.replace('accept/', "")
            res.end(JSON.stringify(await KillorKeep(songID, 'Keep', res)))

        }
        //must be to delete the song
        else {
            var songID = action.replace('reject/', "")
            res.end(JSON.stringify(await KillorKeep(songID, 'Kill', res)))

        }

    }
    else if (ReplaceMatchUrl(req.url, '/artist/notifications/')) {
        if (ReplaceMatchUrl(req.url, '/artist/notifications/base')) {
            serveStatic_Plus(res, './templates/notification_artist.html', '', { 'who': sessionData.id })
            return

        }
        res.end(JSON.stringify(await NotificationsArtist(sessionData.id)))


    }
    else if (ReplaceMatchUrl(req.url, '/user/notifications/')) {
        if (ReplaceMatchUrl(req.url, '/user/notifications/base')) {
            serveStatic_Plus(res, './templates/notification_user.html', '', { 'who': sessionData.id })
            return

        }
        res.end(JSON.stringify(await NotificationsUser(sessionData.id)))


    }
    else if (ReplaceMatchUrl(req.url, '/mark-reviewed/') && req.method === 'POST') {

        const TypePerson = req.url.replace('/mark-reviewed/', "")
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
        if (TypePerson === 'user') {
            await review_notification_user(sessionData.id, fields.notificationContent)

        }
        else if (TypePerson === "artist") {
            await review_notification_artist(sessionData.id, fields.notificationContent)
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Profile Succesfully Updated' }));




    }
    else if (ReplaceMatchUrl(req.url, "/search_results_admin")) {
        if (req.method === 'POST') {

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
            let search_result = fields.query;
            let boxes_check = fields.filters
            //print(search_result)
            //print(boxes_check)
            if (typeof boxes_check === "string") {
                boxes_check = [boxes_check]
            }
            search_result = search_result.replaceAll(" ", "%%%")
            //print(search_result)

            serveStatic_Plus(res, "./templates/search_results_admin.html", "text/html", { data: `${search_result}+-1${boxes_check}` })
        }
        else {
            //print(req.url)
            const searchInfo = req.url.replace('/search_results_admin/', "");
            //print(searchInfo)
            const search = searchInfo.split("+-1")
            const search_result = search[0].replaceAll("%%%", " ")
            const temp = search.splice(1, search.length)
            //print(temp)
            const boxes_check = temp[0].split(",")


            res.end(JSON.stringify(await getAdminSearchData(search_result, boxes_check)));
        }



    }
    //res.end(JSON.stringify(await DataAlbumsAdmin(id)))
    else if (ReplaceMatchUrl(req.url, "/detail/")) {
        const search_by = req.url.replace("/detail/", "").split('/')

        const category = search_by[0]
        const id = search_by[1]
        // print(category)
        // print(id)
        if (category === "song") {
            serveStatic_Plus(res, './templates/considered_admin.html', '', { 'SongID': id })
        }
        else if (category == "album") {
            serveStatic_Plus(res, './templates/getalbumadmin.html', '', { 'AlbumID': id })
        }
        else if (category == "artist") {
            serveStatic_Plus(res, './templates/getartistadmin.html', '', { 'ArtistID': id })
        }
        else {
            serveStaticFile(res, "./templates/admin.html", "");
        }


    }

    else if (ReplaceMatchUrl(req.url, '/data/album/') && req.method === "GET") {
        const id = req.url.replace("/data/album/", "")
        res.end(JSON.stringify(await DataAlbumsAdmin(id)))
    }
    else if (ReplaceMatchUrl(req.url, '/data/artist/') && req.method === "GET") {
        const id = req.url.replace("/data/artist/", "")
        res.end(JSON.stringify(await DataArtistAdmin(id)))
    }
    else if(ReplaceMatchUrl(req.url,'/delete/album/'))
    {
        await DeleteAlbum(req.url.replace("/delete/album/",""))

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Profile Succesfully Updated' }));
    }



    // else if(ReplaceMatchUrl(req.url,"/search_results_admin") && req.method==="GET"){
    //     res.end(JSON.stringify(await getAdminSearchData(search_result,boxes_check)));
    // }

    //charlie edits
    else if (ReplaceMatchUrl(req.url, '/create_report') && req.method === 'POST') {
        const queries = {
            top_genres:
                `SELECT G.Name as Genre, COUNT(*) as Listens 
            FROM ListenedToHistory as LTH, Song as S, Genre as G 
            WHERE DATE(DateAccessed) >= DATE(?) AND DATE(DateAccessed) <= DATE(?) AND LTH.SongID = S.SongID AND S.GenreCode = G.GenreCode 
            GROUP BY Genre
            ORDER BY Listens DESC;`,
            top_songs:
                `SELECT Song.Name as Song, COUNT(*) as Listens
            FROM ListenedToHistory as LTH
            JOIN Song ON Song.SongID = LTH.SongID
            WHERE DATE(LTH.DateAccessed) >= DATE(?) AND DATE(LTH.DateAccessed) <= DATE(?)
            GROUP BY Song
            ORDER BY Listens DESC
            LIMIT 10;`,
            top_artists:
                `SELECT A.ArtistName AS Artist, COUNT(*) AS Listens
            FROM ListenedToHistory AS LTH, Artist AS A, Song AS S, Album as Al
            WHERE DATE(LTH.DateAccessed) >= DATE(?) AND DATE(LTH.DateAccessed) <= DATE(?) AND LTH.SongID = S.SongID AND S.AlbumID = Al.AlbumID AND Al.AlbumID = A.ArtistID
            GROUP BY Artist
            ORDER BY Listens DESC
            LIMIT 10;`,
            top_albums:
                `SELECT A.AlbumName as Album, COUNT(*) AS Listens
            FROM ListenedToHistory AS LTH, Album AS A, Song AS S
            WHERE DATE(LTH.DateAccessed) >= DATE(?) AND DATE(LTH.DateAccessed) <= DATE(?) AND LTH.SongID = S.SongID and S.AlbumID = A.AlbumID
            GROUP BY Album
            ORDER BY Listens DESC
            LIMIT 10;`,

            overtime:
            `SELECT 'New Listeners' AS Type, DATE_FORMAT(CreationStamp, '%Y,%m,%d') AS Month, COUNT(*) AS Count
            FROM Listener
            WHERE CreationStamp >= Date(?) AND CreationStamp <= Date(?)
            GROUP BY Month
            
            UNION ALL
            
            SELECT 'New Artists' AS Type, DATE_FORMAT(CreationStamp, '%Y,%m,%d') AS Month, COUNT(*) AS Count
            FROM Artist
            WHERE CreationStamp >= Date(?) AND CreationStamp <= Date(?)
            GROUP BY Month
            
            UNION ALL
            
            SELECT 'New Songs' AS Type, DATE_FORMAT(CreationTimestamp, '%Y,%m,%d') AS Month, COUNT(*) AS Count
            FROM Song
            WHERE CreationTimestamp >= Date(?) AND CreationTimestamp <= Date(?)
            GROUP BY Month
            
            UNION ALL
            
            SELECT 'Listens' AS Type, DATE_FORMAT(DateAccessed, '%Y,%m,%d') AS Month, COUNT(*) AS Count
            FROM ListenedToHistory
            WHERE DateAccessed >= Date(?) AND DateAccessed <= Date(?)
            GROUP BY Month
            
            ORDER BY Month, Type;`

        }
        try {
            if (getRole(sessionData) !== 'admin') {
                res.writeHead(401);
                res.end('<h1>Unauthorized</h1>');
            }
            else {
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
                let query;
                // Build the SQL query based on the form fields
                let vals = [];
                if (fields.startDate) {

                    vals.push(fields.startDate);
                }

                if (fields.endDate) {
                    vals.push(fields.endDate);
                }
                if(fields.type === 'line'){
                    for(let i = 0; i < 3; i++){
                        vals.push(fields.startDate);
                        vals.push(fields.endDate);
                    }
                    console.log(vals);
                    query = queries["overtime"];
                }
                else{
                    if (fields.category === 'Artist') {
                        query = queries['top_artists'];
                    }
                    else if (fields.category === 'Album') {
                        query = queries['top_albums'];
                    }
                    else if (fields.category === 'Genre') {
                        query = queries['top_genres'];
                    }
                    else if(fields.category === 'Song'){
                        query = queries['top_songs'];
                    }
                }
                
                // Execute the query
                const results = await executeQuery(query, vals);
                
                // Send the results as JSON to the client
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(results));
            }
        }
        catch (error) {
            console.error('Error processing report:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal Server Error' }));
        }
    }
    else if (ReplaceMatchUrl(req.url, '/create_report') && req.method === 'GET') {
        try {
            serveStaticFile(res, './templates/create_report.html', '');
        }
        catch (error) {
            console.error('Error processing listener data:', error);
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end('<h1>Internal Server Error</h1>');
        }
    }

    // css of the homepage
    else if (req.url === '/styles.css') {
        serveStaticFile(res, './public/styles.css', 'text/css');
    }
    else if (req.url === '/style_admin.css') {
        serveStaticFile(res, './public/style_admin.css', 'text/css');
    }

    //if you need a picture of an album that does not exist
    else if (req.url === '/npc/picture') {
        serveStaticFile(res, './public/cartoon-mysterious.png', 'image/png')
    }
    //picture of a profile picture
    ///default/person/picture
    else if (req.url === '/default/person/picture') {
        serveStaticFile(res, './public/default_user.png', 'image/png')
    }
    else if (req.url === '/base.js') {
        serveStaticFile(res, './public/base.js', 'text/css');
    }
    else if (req.url === '/base_one.js') {
        serveStaticFile(res, './public/base_one.js', 'text/css');
    }
    //picture of Coog Music (top left screen)
    else if (req.url === '/logo.png') {

        serveStaticFile(res, './public/logo.png', "image/png");
    }
    //picture of Lady Playing the Guitar
    else if (req.url === "/homepage.svg") {
        serveStaticFile(res, './public/homepage.svg', 'image/svg+xml');
    }
    //picture of the logo
    else if (req.url === "/favicon.ico") {
        serveStaticFile(res, "./public/favicon.ico", '');
    }
    //To go to the Login_Options HTML
    else if (req.url === "/getstarted") {
        serveStaticFile(res, './templates/login_options.html', 'text/html');
    }
    else if (req.url === "/style_admin_consider.css") {
        serveStaticFile(res, './public/style_admin_consider.css', 'text/css');

    }
    else if (req.url === "/report-song") {
        //print(req.url)
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
            const user = sessionData['id']; // Ensure sessionData['id'] is correctly populated
            const songID = (fields['SongID']); // Assuming you want to log the fields for debugging

            const Inthere = 'SELECT UserID,SongID FROM UserFlags WHERE SongID=? AND UserID =?';

            const Results = await executeQuery(Inthere, [songID, user]);
            // console.log(Results);


            //delete the instance 
            if (Results.length > 0) {

                const query = 'DELETE FROM UserFlags WHERE UserID = ? AND SongID = ?';
                await executeQuery(query, [user, songID])
            }
            else {
                let currentPassQuery = 'INSERT INTO UserFlags (SongID, UserID) VALUES (?, ?)';
                await executeQuery(currentPassQuery, [songID, sessionData['id']])

            }

            // Add database insertion logic or other processing here

            // Send success response
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'Flag inserted successfully' }));
        } catch (err) {
            console.error(err);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('An error occurred during form processing');
        }
    }



    else if (req.url === "/topbar") {



        if (getRole(sessionData) === 'listener') {
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
                <li>
                <a href="/user/notifications/base/${sessionData.id}">
                <span>Notifications <span class=${getColorNotification(await getnotificationCount(getRole(sessionData), sessionData.id))}>(${await getnotificationCount(getRole(sessionData), sessionData.id)})</span></span>
                </a>
            </li>
            <li>
        </li>
            </ul>
         
            
            <ul class="topbar_navigation">
                <li>
                    <a href="/logout">
                        <span>Log Out</span>
                    </a>
                </li>
            </ul>`;
            res.end(html);
        } else if (getRole(sessionData) === 'artist') {
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
                        <a href="/artist_insights">
                            <span>Artist Insights</span>
                        </a>
                    </li>
                    <li>
                        <a href="/album/create">
                            <span>Publish Album</span>
                        </a>
                    </li>
                    <li>
                    <a href="/song/upload">
                        <span>Upload Song</span>
                    </a>
                    </li>
                    <li>
                    <a href="/artist/notifications/base/${sessionData.id}">
                    <span>Notifications <span class=${getColorNotification(await getnotificationCount(getRole(sessionData), sessionData.id))}>(${await getnotificationCount(getRole(sessionData), sessionData.id)})</span></span>
                </a>
                    </li>
                    <li>
        
                </li>

                </ul>
     
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
    else if (req.url === "/sidebar") {
        if (getRole(sessionData) === 'listener') {
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
                                <a href="/search">
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
            for (const playlist of data.playlists) {
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
            for (const follow of data.following) {
                html += `<li>
                                        <img src="/artist/${follow['ArtistID']}/pic">
                                        <a href='/artist/${follow['ArtistID']}'>${follow['ArtistName']}</a>
                                    </li>`;
            }
            html += `
                                </ul>
                            </li>
                        </ul>
                    </div>`;
            res.end(html);
        } else if (getRole(sessionData) === 'artist') {
            const data = await getArtist(sessionData, res);
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
                                <span>My Albums</span>
                            </a>
                            <a href="/album/create" class="add_album">+</a>
                            <ul class="list_container">`;
            for (const album of data.albums) {
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
            for (const follow of data.followers) {
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
        }

        else {
            res.writeHead(404);
            res.end('Not Found');
        }
    }
    //cd Desktop/TRA/COSC-3380-Project/nodejs nodemon server.js
    else if ((matchUrl(req.url, '/login')) && req.method === 'GET') {
        if (params['role'] === 'listener' || params['role'] === 'artist' || params['role'] === 'admin') {
            serveStatic_Plus(res, './templates/login.html', 'text/html', { 'role': params['role'] }); //basically doing nujucks 
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    }
    else if (matchUrl(req.url, '/register') && req.method === 'GET') {
        if (params['role'] === 'listener' || params['role'] === 'artist') {
            // console.log(params['role']);
            serveStatic_Plus(res, './templates/register.html', 'text/html', { 'role': params['role'] });
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    } else if (matchUrl(req.url, '/login') && req.method === 'POST') {
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

    // Registration Form Insert
    else if (matchUrl(req.url, '/register') && req.method === 'POST') {

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
        else if (role === 'artist') {
            query = 'INSERT INTO Artist (ArtistName, Email, DOB, UserName, Password, Pnumber) VALUES (?, ?, ?, ?, ?, ?)';
            vals = [fields.name, fields.email, fields.DOB, fields.username, fields.password, fields.pnum]
            result_query = "SELECT * FROM Artist WHERE ArtistID = LAST_INSERT_ID()"
        }
        else {
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

    else if (matchUrl(req.url, '/logout') && req.method === 'GET') {
        sessionData = {};
        res.setHeader('Set-Cookie', `session=${createToken(sessionData)}; HttpOnly`);
        res.writeHead(302, { Location: '/' });
        res.end();
        //hey buddy
    }

    // Serve Edit Profile Page
    else if (matchUrl(req.url, '/edit') && req.method == 'GET') {
        if (getRole(sessionData) === 'listener') {
            serveStaticFile(res, './templates/listener_edit.html', "");
        }
        else if (getRole(sessionData) === 'artist') {
            serveStaticFile(res, './templates/artist_edit.html', "");
        }
    }

    else if (matchUrl(req.url, '/edit') && req.method == 'POST') {
        if (getRole(sessionData) === 'listener') {

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


            let query = "UPDATE Listener SET ";
            let conditions = [];
            let vals = [];

            if (fields.username && fields.username !== '') {
                conditions.push(`Username = ?`);
                vals.push(`${fields.username}`);
                sessionData.username = fields.username;
            }
            if (fields.email && fields.email !== '') {
                conditions.push(`Email = ?`);
                vals.push(`${fields.email}`);
            }
            if (fields.newpassword) {
                let currentPassQuery = 'SELECT Password FROM Listener WHERE UserID=?';
                const currentPassResults = await executeQuery(currentPassQuery, [sessionData['id']])
                //console.log(currentPassResults);
                if (currentPassResults.length > 0) {
                    const currentPass = currentPassResults[0].Password;
                    if (fields.newpassword === fields.confirmpassword && currentPass === fields.password) {
                        conditions.push(`Password = ?`);
                        vals.push(fields.newpassword);
                    }
                    else {
                        // console.log("Password did not update")
                    }
                }
            }

            if (conditions.length > 0) {
                query += conditions.join(", ")
                query += ' WHERE UserID = ?'
            }

            // Add UserID to the values array
            vals.push(sessionData['id']);
            // console.log(query);

            // Execute the query
            if (conditions.length > 0) {
                const results = await executeQuery(query, vals);
                // console.log(results)
                res.setHeader('Set-Cookie', `session=${createToken(sessionData)}; HttpOnly`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'Profile Succesfully Updated' }));
            }
            else if (conditions.length === 0) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Unable To Update' }));
            }
            else {
                res.setHeader('Set-Cookie', `session=${createToken(sessionData)}; HttpOnly`);
                res.writeHead(302, { Location: '/edit' });
                res.end();
            }
        }
        else if (getRole(sessionData) === 'artist') {

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


            let query = "UPDATE Artist SET ";
            let conditions = [];
            let vals = [];

            if (fields.username && fields.username !== '') {
                conditions.push(`UserName = ?`);
                vals.push(`${fields.username}`);
                sessionData.username = fields.username;
            }
            if (fields.email && fields.email !== '') {
                conditions.push(`Email = ?`);
                vals.push(`${fields.email}`);
            }
            if (fields.newpassword) {
                let currentPassQuery = 'SELECT Password FROM Artist WHERE ArtistID=?';
                const currentPassResults = await executeQuery(currentPassQuery, [sessionData['id']])
                // console.log(currentPassResults);
                if (currentPassResults.length > 0) {
                    const currentPass = currentPassResults[0].Password;
                    if (fields.newpassword === fields.confirmpassword && currentPass === fields.password) {
                        conditions.push(`Password = ?`);
                        vals.push(fields.newpassword);
                    }
                    else {
                        //console.log("Password did not update")
                    }
                }
            }

            if (conditions.length > 0) {
                query += conditions.join(", ")
                query += ' WHERE ArtistID = ?'
            }

            // Add UserID to the values array
            vals.push(sessionData['id']);
            // console.log(query);

            // Execute the query
            if (conditions.length > 0) {
                const results = await executeQuery(query, vals);
                //console.log(results)
                res.setHeader('Set-Cookie', `session=${createToken(sessionData)}; HttpOnly`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'Profile Succesfully Updated' }));
            }
            else if (conditions.length === 0) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Unable To Update' }));
            }
            else {
                res.setHeader('Set-Cookie', `session=${createToken(sessionData)}; HttpOnly`);
                res.writeHead(302, { Location: '/edit' });
                res.end();
            }
        }

        else {
            res.writeHead(401);
            res.end('<h1>Unauthorized</h1>');
        }
    }

    else if (matchUrl(req.url, '/ajax/edit') && req.method == 'GET') {
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
                //console.log(data.email);

                data.username = sessionData.username;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(data));
            } catch (error) {
                console.error('Error fetching data:', error);
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end('<h1>Internal Server Error</h1>');
            }
        }
        else if (getRole(sessionData) === 'artist') {
            try {
                const data = await getArtistBaseData(sessionData.id);

                const userProfileQuery = 'SELECT UserName, Email, ArtistName FROM Artist WHERE ArtistID=?';
                const vals = [sessionData['id']];

                const results = await executeQuery(userProfileQuery, vals);

                if (results.length === 0) {
                    throw new Error('User not found');
                }

                // Store Query Results
                data.email = results[0]['Email'];
                //console.log(data.email);
                data.ArtistName = results[0]['ArtistName'];

                data.username = sessionData.username;
                //console.log(data.username);
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
    }

    // Serve Artist Insights Page
    else if (matchUrl(req.url, '/artist_insights') && req.method === "GET") {
        try {
            if (getRole(sessionData) !== 'artist') {
                res.writeHead(401);
                res.end('<h1>Unauthorized</h1>');
            }

            else {
                const data = await getArtistBaseData(sessionData.id);
                data.username = sessionData.username;

                serveStaticFile(res, './templates/artist_insights.html', '');
            }
        }

        catch (error) {
            console.error('Error processing artist data:', error);
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end('<h1>Internal Server Error</h1>');
        }
    }

    // Artist Insights Report
    else if (matchUrl(req.url, '/artist_insights') && req.method === 'POST') {
        try {
            if (getRole(sessionData) !== 'artist') {
                res.writeHead(401);
                res.end('<h1>Unauthorized</h1>');
            } else {
                const data = await getArtistBaseData(sessionData.id);

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

                // Build the SQL query based on the form fields
                let query = `
                SELECT
                    DAYNAME(DateAccessed) AS DayOfWeek,
                    FLOOR(HOUR(DateAccessed) / 4) * 4 AS HourInterval,
                    COUNT(*) AS ListenCount
                FROM
                    ListenedToHistory, Song, Album
                WHERE
            `;
                let vals = [];

                if (fields.album) {
                    query += 'Album.AlbumID = ? AND ';
                    vals.push(fields.album);
                }

                if (fields.song) {
                    query += 'Song.SongID = ? AND ';
                    vals.push(fields.song);
                } else if (!fields.album && !fields.song) {
                    query += 'Album.ArtistID = ? AND ';
                    vals.push(sessionData['id']);
                }

                if (fields.beginDate) {
                    query += 'DateAccessed >= ? AND ';
                    vals.push(`${fields.beginDate} 00:00:00`);
                }

                if (fields.endDate) {
                    query += 'DateAccessed <= ? AND ';
                    vals.push(`${fields.endDate} 23:59:59`);
                }

                // Remove the trailing ' AND ' from the query
                query = query.slice(0, -5);

                // Group by day of the week, hour interval
                query += `
                    GROUP BY
                    DayOfWeek, HourInterval
                `;

                // Order by day of the week, hour interval
                query += `
                    ORDER BY
                        FIELD(DayOfWeek, 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'),
                        HourInterval
                `;

                // Execute the query
                const results = await executeQuery(query, vals);

                // Format the results for display
                const formattedResults = results.map(result => ({
                    'Day of Week': result.DayOfWeek,
                    'Hours': result.HourInterval,
                    'Number of Listens': result.ListenCount,
                }));

                // Send the results as JSON to the client
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(formattedResults));
            }
        } catch (error) {
            console.error('Error processing artist insights:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal Server Error' }));
        }
    }

    // Serve Listen History Page
    else if (matchUrl(req.url, '/history') && req.method === "GET") {
        try {
            if (getRole(sessionData) !== 'listener') {
                res.writeHead(401);
                res.end('<h1>Unauthorized</h1>');
            }

            else {
                const data = await getListenerBaseData(sessionData.id);
                data.username = sessionData.username;

                serveStaticFile(res, './templates/listener_history.html', '');
            }
        }

        catch (error) {
            console.error('Error processing listener data:', error);
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end('<h1>Internal Server Error</h1>');
        }
    }

    // Listen History Report
    else if (matchUrl(req.url, '/history') && req.method === 'POST') {
        try {
            if (getRole(sessionData) !== 'listener') {
                res.writeHead(401);
                res.end('<h1>Unauthorized</h1>');
            }
            else {
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

                let conditions = [];

                // Build the SQL query based on the form fields
                let query = 'SELECT Song.Name AS SongName, ArtistName, AlbumName, DateAccessed, Genre.Name AS GenreName FROM ListenedToHistory, Artist, Song, Album, Genre WHERE ';

                let vals = [];
                if (fields.beginDate) {
                    conditions.push(`DateAccessed >= ?`);
                    vals.push(`${fields.beginDate}T00:00:00`);
                }

                if (fields.endDate) {
                    conditions.push(`DateAccessed <= ?`);
                    vals.push(`${fields.endDate}T23:59:59`);
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
                    query = 'SELECT Song.Name AS SongName, ArtistName, AlbumName, DateAccessed, Genre.Name AS GenreName FROM ListenedToHistory, Artist, Song, Album, Genre WHERE UserID=? AND ListenedToHistory.SongID=Song.SongID AND Song.AlbumID=Album.AlbumID AND Artist.ArtistID=Album.ArtistID AND Song.GenreCode=Genre.GenreCode ORDER BY DateAccessed DESC';
                }
                else {
                    query += conditions.join(' AND ');
                    query += ' AND UserID=? AND ListenedToHistory.SongID=Song.SongID AND Song.AlbumID=Album.AlbumID AND Artist.ArtistID=Album.ArtistID AND Song.GenreCode=Genre.GenreCode ORDER BY DateAccessed DESC';
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
        }
        catch (error) {
            console.error('Error processing listener history:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal Server Error' }));
        }
    } 

    else if (matchUrl(req.url, '/insights') && req.method === 'GET') {
        try {
            if (getRole(sessionData) !== 'artist') {
                res.writeHead(401);
                res.end('<h1>Unautorized</h1>');
            }
            else {
                serveStaticFile(res, './templates/artist_report.html', "");
            }
        } catch (error) {
            console.error('Error processing report:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal Server Error' }));
        }
    }

    else if (matchUrl(req.url, '/insights') && req.method === 'POST') {
        try {
            if (getRole(sessionData) !== 'artist') {
                res.writeHead(401);
                res.end('<h1>Unauthorized</h1>');
            }
            else {
                const data = await getArtistBaseData(sessionData.id);
                    
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
                
                let conditions = [];
                
                // Build the SQL query based on the form fields
                let query =`SELECT
                Listener.Username,
                Song.Name AS SongName,
                Album.AlbumName,
                Listener.DOB AS DOB,
                ListenedToHistory.DateAccessed,
                Genre.Name AS GenreName
            FROM
                ListenedToHistory
            JOIN
                Song ON ListenedToHistory.SongID = Song.SongID
            JOIN
                Album ON Song.AlbumID = Album.AlbumID
            JOIN
                Artist ON Album.ArtistID = Artist.ArtistID
            JOIN
                Genre ON Song.GenreCode = Genre.GenreCode
            JOIN
                Listener ON ListenedToHistory.UserID = Listener.UserID
            WHERE

            `;

                let vals = [];
                if (fields.beginDate) {
                    conditions.push(`DateAccessed >= ?`);
                    vals.push(`${fields.beginDate}T00:00:00`);
                }

                if (fields.endDate) {
                    conditions.push(`DateAccessed <= ?`);
                    vals.push(`${fields.endDate}T23:59:59`);
                }

                if (fields.album) {
                    conditions.push(`AlbumName LIKE ?`);
                    vals.push(`%${fields.album}%`);
                }

                if (fields.song) {
                    conditions.push(`Song.Name LIKE ?`);
                    vals.push(`%${fields.song}%`);
                }

                if (fields.genre) {
                    conditions.push(`Song.GenreCode = ?`);
                    vals.push(fields.genre);
                }
                if (fields.age) {
                    if (fields.age === '1') {
                        const oldestCurrentDate = new Date();
                        const oldestDOB = oldestCurrentDate.getFullYear() - 18;
                        oldestCurrentDate.setFullYear(oldestDOB);

                        const oldestFormattedDate = oldestCurrentDate.toISOString().replace(/T/, ' ').replace(/\.\d+Z$/, '');

                        console.log(oldestFormattedDate);

                        const youngestCurrentDate = new Date();
                        const youngestDOB = youngestCurrentDate.getFullYear() - 13;
                        youngestCurrentDate.setFullYear(youngestDOB);

                        const youngestFormattedDate = youngestCurrentDate.toISOString().replace(/T/, ' ').replace(/\.\d+Z$/, '')

                        console.log(youngestFormattedDate);

                        conditions.push('Listener.DOB >= ? AND Listener.DOB <= ?')
                        vals.push(oldestFormattedDate, youngestFormattedDate)
                    }
                    else if (fields.age === '2') {
                        const oldestCurrentDate = new Date();
                        const oldestDOB = oldestCurrentDate.getFullYear() - 24;
                        oldestCurrentDate.setFullYear(oldestDOB);

                        const oldestFormattedDate = oldestCurrentDate.toISOString().replace(/T/, ' ').replace(/\.\d+Z$/, '');

                        console.log(oldestFormattedDate);

                        const youngestCurrentDate = new Date();
                        const youngestDOB = youngestCurrentDate.getFullYear() - 18;
                        youngestCurrentDate.setFullYear(youngestDOB);

                        const youngestFormattedDate = youngestCurrentDate.toISOString().replace(/T/, ' ').replace(/\.\d+Z$/, '')

                        console.log(youngestFormattedDate);

                        conditions.push('Listener.DOB >= ? AND Listener.DOB <= ?')
                        vals.push(oldestFormattedDate, youngestFormattedDate)
                    }
                    else if (fields.age === '3') {
                        const oldestCurrentDate = new Date();
                        const oldestDOB = oldestCurrentDate.getFullYear() - 34;
                        oldestCurrentDate.setFullYear(oldestDOB);

                        const oldestFormattedDate = oldestCurrentDate.toISOString().replace(/T/, ' ').replace(/\.\d+Z$/, '');

                        console.log(oldestFormattedDate);

                        const youngestCurrentDate = new Date();
                        const youngestDOB = youngestCurrentDate.getFullYear() - 25;
                        youngestCurrentDate.setFullYear(youngestDOB);

                        const youngestFormattedDate = youngestCurrentDate.toISOString().replace(/T/, ' ').replace(/\.\d+Z$/, '')

                        console.log(youngestFormattedDate);

                        conditions.push('Listener.DOB >= ? AND Listener.DOB <= ?')
                        vals.push(oldestFormattedDate, youngestFormattedDate)
                    }
                    else if (fields.age === '4') {
                        const oldestCurrentDate = new Date();
                        const oldestDOB = oldestCurrentDate.getFullYear() - 44;
                        oldestCurrentDate.setFullYear(oldestDOB);

                        const oldestFormattedDate = oldestCurrentDate.toISOString().replace(/T/, ' ').replace(/\.\d+Z$/, '');

                        console.log(oldestFormattedDate);

                        const youngestCurrentDate = new Date();
                        const youngestDOB = youngestCurrentDate.getFullYear() - 35;
                        youngestCurrentDate.setFullYear(youngestDOB);

                        const youngestFormattedDate = youngestCurrentDate.toISOString().replace(/T/, ' ').replace(/\.\d+Z$/, '')

                        console.log(youngestFormattedDate);

                        conditions.push('Listener.DOB >= ? AND Listener.DOB <= ?')
                        vals.push(oldestFormattedDate, youngestFormattedDate)
                    }
                    else if (fields.age === '5') {
                        const oldestCurrentDate = new Date();
                        const oldestDOB = oldestCurrentDate.getFullYear() - 54;
                        oldestCurrentDate.setFullYear(oldestDOB);

                        const oldestFormattedDate = oldestCurrentDate.toISOString().replace(/T/, ' ').replace(/\.\d+Z$/, '');

                        console.log(oldestFormattedDate);

                        const youngestCurrentDate = new Date();
                        const youngestDOB = youngestCurrentDate.getFullYear() - 45;
                        youngestCurrentDate.setFullYear(youngestDOB);

                        const youngestFormattedDate = youngestCurrentDate.toISOString().replace(/T/, ' ').replace(/\.\d+Z$/, '')

                        console.log(youngestFormattedDate);

                        conditions.push('Listener.DOB >= ? AND Listener.DOB <= ?')
                        vals.push(oldestFormattedDate, youngestFormattedDate)
                    }
                    else if (fields.age === '6') {
                        const oldestCurrentDate = new Date();
                        const oldestDOB = oldestCurrentDate.getFullYear() - 64;
                        oldestCurrentDate.setFullYear(oldestDOB);

                        const oldestFormattedDate = oldestCurrentDate.toISOString().replace(/T/, ' ').replace(/\.\d+Z$/, '');

                        console.log(oldestFormattedDate);

                        const youngestCurrentDate = new Date();
                        const youngestDOB = youngestCurrentDate.getFullYear() - 55;
                        youngestCurrentDate.setFullYear(youngestDOB);

                        const youngestFormattedDate = youngestCurrentDate.toISOString().replace(/T/, ' ').replace(/\.\d+Z$/, '')

                        console.log(youngestFormattedDate);

                        conditions.push('Listener.DOB >= ? AND Listener.DOB <= ?')
                        vals.push(oldestFormattedDate, youngestFormattedDate)
                    }
                    else {
                        const currentDate = new Date();
                        const youngestDOB = currentDate.getFullYear() - 65;
                        currentDate.setFullYear(youngestDOB);

                        const youngestFormattedDate = currentDate.toISOString().replace(/T/, ' ').replace(/\.\d+Z$/, '')

                        console.log(youngestFormattedDate);

                        conditions.push('Listener.DOB <= ?')
                        vals.push(youngestFormattedDate)
                    }
                }

                // Join the conditions with 'AND' and complete the query
                if (conditions.length === 0) {
                    query = `SELECT
                    Listener.Username,
                    Song.Name AS SongName,
                    Album.AlbumName,
                    Listener.DOB AS DOB,
                    ListenedToHistory.DateAccessed,
                    Genre.Name AS GenreName
                FROM
                    ListenedToHistory
                JOIN
                    Song ON ListenedToHistory.SongID = Song.SongID
                JOIN
                    Album ON Song.AlbumID = Album.AlbumID
                JOIN
                    Artist ON Album.ArtistID = Artist.ArtistID
                JOIN
                    Genre ON Song.GenreCode = Genre.GenreCode
                JOIN
                    Listener ON ListenedToHistory.UserID = Listener.UserID
                WHERE
                    Artist.ArtistID = ?
                ORDER BY
                    ListenedToHistory.DateAccessed DESC;
                `;
                }
                else {
                    query += conditions.join(' AND ');
                    query += ' AND Artist.ArtistID=? ORDER BY DateAccessed DESC';
                }

                // Add UserID to the values array
                vals.push(sessionData['id']);

                // Execute the query
                const results = await executeQuery(query, vals);
                console.log(query);
                console.log(vals);

                // Change the column name and format the date
                results.forEach((result) => {
                        const dob = typeof result.DOB === 'string' ? new Date(result.DOB) : result.DOB;
                        console.log(dob);
                        const currentDate = new Date();
                        const age = currentDate.getUTCFullYear() - dob.getUTCFullYear();

                        if (currentDate.getUTCMonth() < dob.getUTCMonth() || (currentDate.getUTCMonth() === dob.getUTCMonth() && currentDate.getUTCDate() < dob.getUTCDate())) {
                                result['Age'] = age - 1;
                            } else {
                                result['Age'] = age;
                            }
    
                            console.log(age);
                    const dateDOB = new Date(result.DOB);
                    const dobFormattedDate = dateDOB.toISOString().split('T')[0];
                    result['Date of Birth'] = dobFormattedDate;
                    delete result.DOB;
                    result['Song Name'] = result.SongName;
                    delete result.SongName;
                    result['Genre Name'] = result.GenreName;
                    delete result.GenreName;
                    result['Album Name'] = result.AlbumName;
                    delete result.AlbumName;
                    const date = new Date(result.DateAccessed);
                    const formattedDate = date.toISOString().split('T')[0];
                    result['Date Accessed'] = formattedDate;
                    delete result.DateAccessed;
                });

                console.log(results);

                // Send the results as JSON to the client
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(results));
            }

            console.log("Submission Requested")
        }
        
            catch (error) {
            console.error('Error processing report:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal Server Error' }));
        }
    }
    
    else if (matchUrl(req.url, '/account_creation_report') && req.method === 'POST') {
        try {
            if (getRole(sessionData) !== 'admin') {
                res.writeHead(401);
                res.end('<h1>Unauthorized</h1>');
            }
            else {                
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

                console.log("Submission Requested")
                console.log(fields.accountType)

                // if (fields.accountType === '') {
                    let query ='SELECT Listener.Username AS Username, DOB, CreationStamp FROM Listener WHERE ';

                    let conditions = [];
                    let vals = [];

                    if (fields.beginDate) {
                        conditions.push(`CreationStamp >= ?`);
                        vals.push(`${fields.beginDate}T00:00:00`)
                    }

                    if (fields.endDate) {
                        conditions.push(`CreationStamp <= ?`);
                        vals.push(`${fields.endDate}T23:59:59`)
                    }

                    if (fields.age) {
                        if (fields.age === '1') {
                            const oldestCurrentDate = new Date();
                            const oldestDOB = oldestCurrentDate.getFullYear() - 18;
                            oldestCurrentDate.setFullYear(oldestDOB);

                            const oldestFormattedDate = oldestCurrentDate.toISOString().replace(/T/, ' ').replace(/\.\d+Z$/, '');

                            console.log(oldestFormattedDate);

                            const youngestCurrentDate = new Date();
                            const youngestDOB = youngestCurrentDate.getFullYear() - 13;
                            youngestCurrentDate.setFullYear(youngestDOB);

                            const youngestFormattedDate = youngestCurrentDate.toISOString().replace(/T/, ' ').replace(/\.\d+Z$/, '')

                            console.log(youngestFormattedDate);

                            conditions.push('DOB >= ? AND DOB <= ?')
                            vals.push(oldestFormattedDate, youngestFormattedDate)
                        }
                        else if (fields.age === '2') {
                            const oldestCurrentDate = new Date();
                            const oldestDOB = oldestCurrentDate.getFullYear() - 24;
                            oldestCurrentDate.setFullYear(oldestDOB);

                            const oldestFormattedDate = oldestCurrentDate.toISOString().replace(/T/, ' ').replace(/\.\d+Z$/, '');

                            console.log(oldestFormattedDate);

                            const youngestCurrentDate = new Date();
                            const youngestDOB = youngestCurrentDate.getFullYear() - 18;
                            youngestCurrentDate.setFullYear(youngestDOB);

                            const youngestFormattedDate = youngestCurrentDate.toISOString().replace(/T/, ' ').replace(/\.\d+Z$/, '')

                            console.log(youngestFormattedDate);

                            conditions.push('DOB >= ? AND DOB <= ?')
                            vals.push(oldestFormattedDate, youngestFormattedDate)
                        }
                        else if (fields.age === '3') {
                            const oldestCurrentDate = new Date();
                            const oldestDOB = oldestCurrentDate.getFullYear() - 34;
                            oldestCurrentDate.setFullYear(oldestDOB);

                            const oldestFormattedDate = oldestCurrentDate.toISOString().replace(/T/, ' ').replace(/\.\d+Z$/, '');

                            console.log(oldestFormattedDate);

                            const youngestCurrentDate = new Date();
                            const youngestDOB = youngestCurrentDate.getFullYear() - 25;
                            youngestCurrentDate.setFullYear(youngestDOB);

                            const youngestFormattedDate = youngestCurrentDate.toISOString().replace(/T/, ' ').replace(/\.\d+Z$/, '')

                            console.log(youngestFormattedDate);

                            conditions.push('DOB >= ? AND DOB <= ?')
                            vals.push(oldestFormattedDate, youngestFormattedDate)
                        }
                        else if (fields.age === '4') {
                            const oldestCurrentDate = new Date();
                            const oldestDOB = oldestCurrentDate.getFullYear() - 44;
                            oldestCurrentDate.setFullYear(oldestDOB);

                            const oldestFormattedDate = oldestCurrentDate.toISOString().replace(/T/, ' ').replace(/\.\d+Z$/, '');

                            console.log(oldestFormattedDate);

                            const youngestCurrentDate = new Date();
                            const youngestDOB = youngestCurrentDate.getFullYear() - 35;
                            youngestCurrentDate.setFullYear(youngestDOB);

                            const youngestFormattedDate = youngestCurrentDate.toISOString().replace(/T/, ' ').replace(/\.\d+Z$/, '')

                            console.log(youngestFormattedDate);

                            conditions.push('DOB >= ? AND DOB <= ?')
                            vals.push(oldestFormattedDate, youngestFormattedDate)
                        }
                        else if (fields.age === '5') {
                            const oldestCurrentDate = new Date();
                            const oldestDOB = oldestCurrentDate.getFullYear() - 54;
                            oldestCurrentDate.setFullYear(oldestDOB);

                            const oldestFormattedDate = oldestCurrentDate.toISOString().replace(/T/, ' ').replace(/\.\d+Z$/, '');

                            console.log(oldestFormattedDate);

                            const youngestCurrentDate = new Date();
                            const youngestDOB = youngestCurrentDate.getFullYear() - 45;
                            youngestCurrentDate.setFullYear(youngestDOB);

                            const youngestFormattedDate = youngestCurrentDate.toISOString().replace(/T/, ' ').replace(/\.\d+Z$/, '')

                            console.log(youngestFormattedDate);

                            conditions.push('DOB >= ? AND DOB <= ?')
                            vals.push(oldestFormattedDate, youngestFormattedDate)
                        }
                        else if (fields.age === '6') {
                            const oldestCurrentDate = new Date();
                            const oldestDOB = oldestCurrentDate.getFullYear() - 64;
                            oldestCurrentDate.setFullYear(oldestDOB);

                            const oldestFormattedDate = oldestCurrentDate.toISOString().replace(/T/, ' ').replace(/\.\d+Z$/, '');

                            console.log(oldestFormattedDate);

                            const youngestCurrentDate = new Date();
                            const youngestDOB = youngestCurrentDate.getFullYear() - 55;
                            youngestCurrentDate.setFullYear(youngestDOB);

                            const youngestFormattedDate = youngestCurrentDate.toISOString().replace(/T/, ' ').replace(/\.\d+Z$/, '')

                            console.log(youngestFormattedDate);

                            conditions.push('DOB >= ? AND DOB <= ?')
                            vals.push(oldestFormattedDate, youngestFormattedDate)
                        }
                        else {
                            const currentDate = new Date();
                            const youngestDOB = currentDate.getFullYear() - 65;
                            currentDate.setFullYear(youngestDOB);

                            const youngestFormattedDate = currentDate.toISOString().replace(/T/, ' ').replace(/\.\d+Z$/, '')

                            console.log(youngestFormattedDate);

                            conditions.push('DOB <= ?')
                            vals.push(youngestFormattedDate)
                        }
                    }

                    console.log(vals);

                    // If there are no filters by the user
                    if (conditions.length === 0) {

                        // If the account type filter is any
                        if (fields.accountType === '') {
                            let listenerQuery = 'SELECT Listener.Username, DOB, CreationStamp FROM Listener';
                            const listenerResults = await executeQuery(listenerQuery);
                            console.log(listenerResults);
                            for (let i=0; i<listenerResults.length; i++) {
                                listenerResults[i].accountType = 'Listener';
                            }
    
                            let artistQuery = 'SELECT Artist.Username, DOB, CreationStamp FROM Artist';
                            const artistResults = await executeQuery(artistQuery);
                            for (let i=0; i<artistResults.length; i++) {
                                artistResults[i].accountType = 'Artist'
                            }
    
                            let results = [...listenerResults, ...artistResults]
    
                            // Change the column name and format the date
                            results.forEach((result) => {
                                result['Account Type'] = result.accountType;
                                delete result.accountType;
                                const dob = typeof result.DOB === 'string' ? new Date(result.DOB) : result.DOB;
                                console.log(dob);
                                const currentDate = new Date();
                                const age = currentDate.getUTCFullYear() - dob.getUTCFullYear();
    
                                if (currentDate.getUTCMonth() < dob.getUTCMonth() || (currentDate.getUTCMonth() === dob.getUTCMonth() && currentDate.getUTCDate() < dob.getUTCDate())) {
                                        result['Age'] = age - 1;
                                    } else {
                                        result['Age'] = age;
                                    }
    
                                    console.log(age);
                                
                                const dateDOB = new Date(result.DOB);
                                const dobFormattedDate = dateDOB.toISOString().split('T')[0];
                                result['Date of Birth'] = dobFormattedDate;
                                delete result.DOB;
                                const date = new Date(result.CreationStamp);
                                const formattedDate = date.toISOString().split('T')[0];
                                result['Account Creation Date'] = formattedDate;
                                delete result.CreationStamp;
                            });
                            console.log(results);
    
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify(results));
                        }

                        // If the account type filter is listener
                        else if (fields.accountType === 'listener') {
                            let listenerQuery = 'SELECT Listener.Username, DOB, CreationStamp FROM Listener';
                            const listenerResults = await executeQuery(listenerQuery);
                            console.log(listenerResults);
                            for (let i=0; i<listenerResults.length; i++) {
                                listenerResults[i].accountType = 'Listener';
                            }
    
                            let results = listenerResults;

                            results.forEach((result) => {
                                result['Account Type'] = result.accountType;
                                delete result.accountType;
                                const dob = typeof result.DOB === 'string' ? new Date(result.DOB) : result.DOB;
                                console.log(dob);
                                const currentDate = new Date();
                                const age = currentDate.getUTCFullYear() - dob.getUTCFullYear();
    
                                if (currentDate.getUTCMonth() < dob.getUTCMonth() || (currentDate.getUTCMonth() === dob.getUTCMonth() && currentDate.getUTCDate() < dob.getUTCDate())) {
                                        result['Age'] = age - 1;
                                    } else {
                                        result['Age'] = age;
                                    }
    
                                    console.log(age);
                                
                                const dateDOB = new Date(result.DOB);
                                const dobFormattedDate = dateDOB.toISOString().split('T')[0];
                                result['Date of Birth'] = dobFormattedDate;
                                delete result.DOB;
                                const date = new Date(result.CreationStamp);
                                const formattedDate = date.toISOString().split('T')[0];
                                result['Account Creation Date'] = formattedDate;
                                delete result.CreationStamp;
                            });
    
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify(results));
                        }
                        // If the account type filter is artist
                        else if (fields.accountType ==='artist') {
                            let artistQuery = 'SELECT Artist.Username, DOB, CreationStamp FROM Artist';
                            const artistResults = await executeQuery(artistQuery);
                            console.log(artistResults);
                            for (let i=0; i<artistResults.length; i++) {
                                artistResults[i].accountType = 'Artist';
                            }

                            let results = artistResults;

                            results.forEach((result) => {
                                result['Account Type'] = result.accountType;
                                delete result.accountType;
                                const dob = typeof result.DOB === 'string' ? new Date(result.DOB) : result.DOB;
                                console.log(dob);
                                const currentDate = new Date();
                                const age = currentDate.getUTCFullYear() - dob.getUTCFullYear();
    
                                if (currentDate.getUTCMonth() < dob.getUTCMonth() || (currentDate.getUTCMonth() === dob.getUTCMonth() && currentDate.getUTCDate() < dob.getUTCDate())) {
                                        result['Age'] = age - 1;
                                    } else {
                                        result['Age'] = age;
                                    }
    
                                    console.log(age);
                                
                                const dateDOB = new Date(result.DOB);
                                const dobFormattedDate = dateDOB.toISOString().split('T')[0];
                                result['Date of Birth'] = dobFormattedDate;
                                delete result.DOB;
                                const date = new Date(result.CreationStamp);
                                const formattedDate = date.toISOString().split('T')[0];
                                result['Account Creation Date'] = formattedDate;
                                delete result.CreationStamp;
                            });

                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify(results));
                        }
                    }

                    // If the user applied any Start/End Date filer or Age group
                    else {
                        // If the account type filter is set to Any
                        if (fields.accountType === '') {
                            const listenerQuery = query += conditions.join(' AND ');
                        let artistQuery = 'SELECT Artist.Username, DOB, CreationStamp FROM Artist WHERE ' ;
                        const conditionedArtistQuery = artistQuery += conditions.join(' AND ');

                        console.log(vals);
                        const listenerResults = await executeQuery(listenerQuery, vals)
                        for (let i=0; i<listenerResults.length; i++) {
                            listenerResults[i].accountType = 'Listener';
                        }
                        const artistResults = await executeQuery(conditionedArtistQuery, vals)
                        for (let i=0; i<artistResults.length; i++) {
                            artistResults[i].accountType = 'Artist';
                        }

                        let results = [...listenerResults, ...artistResults]

                        results.forEach((result) => {
                            result['Account Type'] = result.accountType;
                            delete result.accountType;
                            const dob = typeof result.DOB === 'string' ? new Date(result.DOB) : result.DOB;
                            console.log(dob);
                            const currentDate = new Date();
                            const age = currentDate.getUTCFullYear() - dob.getUTCFullYear();

                            if (currentDate.getUTCMonth() < dob.getUTCMonth() || (currentDate.getUTCMonth() === dob.getUTCMonth() && currentDate.getUTCDate() < dob.getUTCDate())) {
                                    result['Age'] = age - 1;
                                } else {
                                    result['Age'] = age;
                                }

                                console.log(age);
                            
                            const dateDOB = new Date(result.DOB);
                            const dobFormattedDate = dateDOB.toISOString().split('T')[0];
                            result['Date of Birth'] = dobFormattedDate;
                            delete result.DOB;
                            const date = new Date(result.CreationStamp);
                            const formattedDate = date.toISOString().split('T')[0];
                            result['Account Creation Date'] = formattedDate;
                            delete result.CreationStamp;
                        });

                        // console.log(results)

                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(results));
                        }

                        // If the account type filter is set to Listener
                        else if (fields.accountType === 'listener') {
                            const listenerQuery = query += conditions.join(' AND ');

                            console.log(vals);
                            const listenerResults = await executeQuery(listenerQuery, vals)
                            for (let i=0; i<listenerResults.length; i++) {
                                listenerResults[i].accountType = 'Listener';
                            }
    
                            let results = listenerResults;

                            results.forEach((result) => {
                                result['Account Type'] = result.accountType;
                                delete result.accountType;
                                const dob = typeof result.DOB === 'string' ? new Date(result.DOB) : result.DOB;
                                console.log(dob);
                                const currentDate = new Date();
                                const age = currentDate.getUTCFullYear() - dob.getUTCFullYear();
    
                                if (currentDate.getUTCMonth() < dob.getUTCMonth() || (currentDate.getUTCMonth() === dob.getUTCMonth() && currentDate.getUTCDate() < dob.getUTCDate())) {
                                        result['Age'] = age - 1;
                                    } else {
                                        result['Age'] = age;
                                    }
    
                                    console.log(age);
                                
                                const dateDOB = new Date(result.DOB);
                                const dobFormattedDate = dateDOB.toISOString().split('T')[0];
                                result['Date of Birth'] = dobFormattedDate;
                                delete result.DOB;
                                const date = new Date(result.CreationStamp);
                                const formattedDate = date.toISOString().split('T')[0];
                                result['Account Creation Date'] = formattedDate;
                                delete result.CreationStamp;
                            });
    
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify(results));
                        }

                        // If the account type filter is set to artist
                        else if (fields.accountType === 'artist') {
                            let selectQuery = 'SELECT Artist.Username AS Username, DOB, CreationStamp FROM Artist WHERE ';
                            const artistQuery = selectQuery += conditions.join(' AND ');

                            console.log(vals);
                            const artistResults = await executeQuery(artistQuery, vals)
                            for (let i=0; i<artistResults.length; i++) {
                                artistResults[i].accountType = 'Artist';
                            }
    
                            let results = artistResults;

                            results.forEach((result) => {
                                result['Account Type'] = result.accountType;
                                delete result.accountType;
                                const dob = typeof result.DOB === 'string' ? new Date(result.DOB) : result.DOB;
                                console.log(dob);
                                const currentDate = new Date();
                                const age = currentDate.getUTCFullYear() - dob.getUTCFullYear();
    
                                if (currentDate.getUTCMonth() < dob.getUTCMonth() || (currentDate.getUTCMonth() === dob.getUTCMonth() && currentDate.getUTCDate() < dob.getUTCDate())) {
                                        result['Age'] = age - 1;
                                    } else {
                                        result['Age'] = age;
                                    }
    
                                    console.log(age);
                                
                                const dateDOB = new Date(result.DOB);
                                const dobFormattedDate = dateDOB.toISOString().split('T')[0];
                                result['Date of Birth'] = dobFormattedDate;
                                delete result.DOB;
                                const date = new Date(result.CreationStamp);
                                const formattedDate = date.toISOString().split('T')[0];
                                result['Account Creation Date'] = formattedDate;
                                delete result.CreationStamp;
                            });
    
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify(results));

                        }
                    }
                }
            }
            catch (error) {
                console.error('Error processing account creation report:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal Server Error' }));
            }
        }
    else if(matchUrl(req.url, '/pic') && req.method === 'GET') {
        try {
            if (getRole(sessionData) === 'listener') {
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

            else if (getRole(sessionData) === 'artist') {
                const query = 'SELECT ProfilePic FROM Artist WHERE ArtistID=?';
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

            else {
                res.writeHead(401);
                res.end('<h1>Unauthorized</h1>');
            }
        }
        catch (error) {
            console.error('Error processing profile picture:', error);
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end('<h1>Internal Server Error</h1>');
        }
    }

    // Serve Search Page For Listener
    else if (matchUrl(req.url, '/search') && req.method === 'GET') {
        if (getRole(sessionData) === 'listener') {
            serveStaticFile(res, './templates/search_form.html', "");
        }
    }

    // Handles Search Requests
    else if (matchUrl(req.url, '/search') && req.method === 'POST') {
        if (getRole(sessionData) === 'listener') {
            const form = new Types.IncomingForm();
            const fields = await new Promise((resolve, reject) => {
                form.parse(req, (err, fields) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve(fields);
                    }
                })
            });

            // console.log("Request Received");
            // console.log(fields.searchBy);

            // Determine if the user is searching for a song, artist, album or all by name.
            if (fields.searchBy === 'song') {
                const query = `SELECT DISTINCT Song.Name AS SongName, Song.SongID AS SongID, ArtistName, Album.AlbumID, Artist.ArtistID FROM Song, Artist, Album WHERE Song.Name LIKE ? AND Song.AlbumID=Album.AlbumID AND Album.ArtistID=Artist.ArtistID`;
                const vals = [`%${fields.search}%`];
                // console.log(fields.search);
                const results = await executeQuery(query, vals);
                for (let i = 0; i < results.length; i++) {
                    results[i].type = 'song';
                }
                // console.log(results);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(results));
            }

            else if (fields.searchBy === 'artist') {
                const query = `SELECT DISTINCT ArtistName, ArtistID FROM Artist WHERE ArtistName LIKE ?  `;
                const vals = [`%${fields.search}%`];
                // console.log(fields.search);
                const results = await executeQuery(query, vals);
                for (let i = 0; i < results.length; i++) {
                    results[i].type = 'artist';
                }
                //console.log(results);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(results));
            }

            else if (fields.searchBy === 'album') {
                const query = `SELECT DISTINCT AlbumName, ArtistName, Album.AlbumID, Artist.ArtistID FROM Album, Artist WHERE AlbumName LIKE ? AND Artist.ArtistID = Album.ArtistID`;
                const vals = [`%${fields.search}%`];
                //console.log(fields.search);
                const results = await executeQuery(query, vals);
                for (let i = 0; i < results.length; i++) {
                    results[i].type = 'album';
                }
                // console.log(results);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(results));
            }

            else if (fields.searchBy === '') {
                let results = [];

                const songQuery = `SELECT DISTINCT Song.Name AS SongName, Song.SongID AS SongID, ArtistName, Album.AlbumID, Artist.ArtistID FROM Song, Artist, Album WHERE Song.Name LIKE ? AND Song.AlbumID=Album.AlbumID AND Album.ArtistID=Artist.ArtistID`;
                const vals = [`%${fields.search}%`];
                //console.log(fields.search);
                const songSearchResults = await executeQuery(songQuery, vals);
                for (let i = 0; i < songSearchResults.length; i++) {
                    songSearchResults[i].type = 'song';
                }

                const albumQuery = `SELECT DISTINCT AlbumName, ArtistName, Album.AlbumID, Artist.ArtistID FROM Album, Artist WHERE AlbumName LIKE ? AND Artist.ArtistID = Album.ArtistID`;
                //console.log(fields.search);
                const albumSearchResults = await executeQuery(albumQuery, vals);
                for (let i = 0; i < albumSearchResults.length; i++) {
                    albumSearchResults[i].type = 'album';
                }

                const artistQuery = `SELECT DISTINCT ArtistName, ArtistID FROM Artist WHERE ArtistName LIKE ?  `;
                const artistSearchResults = await executeQuery(artistQuery, vals);
                for (let i = 0; i < artistSearchResults.length; i++) {
                    artistSearchResults[i].type = 'artist';
                }

                results = [...songSearchResults, ...artistSearchResults, ...albumSearchResults];

                // console.log(fields.search);
                //console.log(results);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(results));
            }

            else {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end("Search Failed");
                return;
            }
        }
    }

    else if (matchUrl(req.url, '/artist/([0-9]+)') && req.method === 'GET') {
        try {
            if (getRole(sessionData) !== 'listener') {
                res.writeHead(401);
                res.end('<h1>Unauthorized</h1>');
            }

            else {
                const data = await getListenerBaseData(sessionData.id);
                data.username = sessionData.username;

                serveStaticFile(res, './templates/artist_info.html', '');
            }
        }
        catch (error) {
            console.error('Error processing follow request:', error);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end("Internal Server Error");
        }
    }

    else if (matchUrl(req.url, '/ajax/artist/([0-9]+)') && req.method === 'GET') {
        try {
            let data = {};
            if (getRole(sessionData) !== 'listener') {
                res.writeHead(401, { 'Content-Type': 'text/plain' });
                res.end("You are not authorized to do that");
                return;
            }

            const artistId = req.url.split('/')[3];

            const artistInfoQuery = 'SELECT Artist.ArtistID, ArtistName, COUNT(Follow.ArtistID) FROM Artist LEFT JOIN Follow ON Artist.ArtistID = Follow.ArtistID WHERE Artist.ArtistID=? GROUP BY Artist.ArtistID, ArtistName';
            const vals = [artistId];

            //console.log(vals);

            data.artistInfo = await executeQuery(artistInfoQuery, vals);

            const artistSongsQuery = 'SELECT Album.AlbumID, Song.Name AS SongName, Album.AlbumName,  Artist.ArtistName, Album.ArtistID, Song.SongID FROM Song, Album, Artist WHERE Song.AlbumID = Album.AlbumID AND Artist.ArtistID = Album.ArtistID AND Artist.ArtistID = ?';
            data.artistSongs = await executeQuery(artistSongsQuery, vals);

            const artistAlbumQuery = 'Select AlbumID, AlbumName FROM Album, Artist WHERE Album.ArtistID = Artist.ArtistID AND Artist.ArtistID = ?'
            data.artistAlbums = await executeQuery(artistAlbumQuery, vals);

            // console.log(data);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));

        }

        catch (error) {
            console.error('Error processing follow request:', error);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end("Internal Server Error");
        }
    }

    else if (matchUrl(req.url, '/artist/([0-9]+)/follow') && req.method === 'GET') {
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

            res.end("Successfully followed");
        } catch (error) {
            console.error('Error processing follow request:', error);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end("Internal Server Error");
        }
    } else if (matchUrl(req.url, '/song/([0-9]+)/rate') && req.method === 'POST') {
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

            res.end("Successfully rated song");
        } catch (error) {
            console.error('Error rating song:', error);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end("Internal Server Error");
        }
    } else if (matchUrl(req.url, '/artist/([0-9]+)/unfollow') && req.method === 'GET') {
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

            res.end("Successfully unfollowed");
        } catch (error) {
            console.error('Error unfollowing artist:', error);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end("Internal Server Error");
        }
    } else if (matchUrl(req.url, '/artist/([0-9]+)/pic') && req.method === 'GET') {
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
    else if (matchUrl(req.url, '/album/([0-9]+)') && req.method === 'GET') {
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

            const formatted_duration_sec = duration_sec.toString().padStart(2, '0');

            //console.log(formatted_duration_sec);

            data.album_duration = `${duration_min} min ${formatted_duration_sec} sec`;

            // Format Release Date to MM/DD/YYYY
            const releaseDate = new Date(data.albumData['ReleaseDate']);
            data.formattedReleaseDate = releaseDate.toLocaleDateString();


            //Josh-album/get all the songs: Need to be Configured for the trigger
            let songQuery = ""
            let songResults = ""
            if (getRole(sessionData) === "listener") {
                songQuery = `
  SELECT 
    ROW_NUMBER() OVER (ORDER BY Song.SongID) AS row_num,
    Song.Name,
    Duration,
    ArtistName,
    Artist.ArtistID,
    Song.SongID,
    Song.flagged,
    Song.reviewed,
    Song.AverageRating,
    CASE 
        WHEN UserFlags.SongID IS NOT NULL THEN 1 
        ELSE 0 
    END AS UserHasFlagged
  FROM 
    Song
    JOIN Album ON Song.AlbumID = Album.AlbumID
    JOIN Artist ON Album.ArtistID = Artist.ArtistID
    LEFT JOIN UserFlags ON Song.SongID = UserFlags.SongID AND UserFlags.UserID = ?
  WHERE 
    Album.AlbumID = ?

`;
                songResults = await executeQuery(songQuery, [sessionData['id'], albumId],);

            }
            else {
                songQuery = 'SELECT ROW_NUMBER() OVER (ORDER BY SongID) row_num, Song.Name, Duration, ArtistName, Artist.ArtistID, Song.SongID,Song.flagged,Song.reviewed,Song.AverageRating FROM Song, Artist, Album WHERE Song.AlbumID=Album.AlbumID AND Album.ArtistID=Artist.ArtistID AND Album.AlbumID=?';
                songResults = await executeQuery(songQuery, [albumId]);

            }




            if (songResults.length === 0) {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end(JSON.stringify(data));
                return;
            }

            data.songData = songResults.map((song) => {
                const duration_min = Math.floor(song.Duration / 60);
                const duration_sec = Math.floor(song.Duration % 60);
                const formatted_duration_sec = duration_sec.toString().padStart(2, '0');
                const duration_str = `${duration_min}:${formatted_duration_sec}`;


                //upadte the name in the return statement
                //if a listener
                if (getRole(sessionData) === 'listener') {



                    return {

                        count: song.row_num,
                        songName: (song.flagged === 1 && song.reviewed === 0) ? "Not Available - " + song.Name : song.Name,
                        Duration: duration_str,
                        artistName: song.ArtistName,
                        artistID: song.ArtistID,
                        songID: song.SongID,
                        Flag: song.flagged,
                        Reviewed: song.reviewed,
                        UserFlagged: song.UserHasFlagged,
                        Rating: song.AverageRating

                    };
                }
                else {
                    //must be an artist
                    return {
                        count: song.row_num,
                        songName: (song.flagged === 1 && song.reviewed === 0) ? "Not Available - " + song.Name : song.Name,
                        Duration: duration_str,
                        artistName: song.ArtistName,
                        artistID: song.ArtistID,
                        songID: song.SongID,
                        Flag: song.flagged,
                        Reviewed: song.reviewed,
                        UserFlagged: -1,
                        Rating: song.AverageRating

                    }

                }
            });
            //print(data.songData)

            // Get AristID from previous query
            const artistID = data.albumData['ArtistID'];

            const moreByQuery = 'SELECT Artist.ArtistID, ArtistName, AlbumID, AlbumName FROM Album, Artist WHERE Album.ArtistID = Artist.ArtistID AND Album.ArtistID = ? AND Album.AlbumID != ? ORDER BY ReleaseDate DESC LIMIT 10';
            const moreByValues = [artistID, albumId];

            const moreByResults = await executeQuery(moreByQuery, moreByValues);
            data.more_by = moreByResults;

            if (getRole(sessionData) === 'artist') {
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
    } else if (matchUrl(req.url, '/album/([0-9]+)/pic') && req.method === 'GET') {
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
    } else if (matchUrl(req.url, '/playlist/([0-9]+)') && req.method === 'GET') {
        if (getRole(sessionData) === 'listener') {
            serveStaticFile(res, './templates/playlist.html', "");
        }
    } else if (matchUrl(req.url, '/playlist/([0-9]+)/add/([0-9]+)') && req.method === 'GET') {
        const playlistId = req.url.split('/')[2];
        const songId = req.url.split('/')[4];
        if (getRole(sessionData) !== 'listener') {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end("You are not authorized to do that");
            return;
        }

        try {
            const result = await executeQuery('SELECT PlaylistSong.SongID, PlaylistID FROM PlaylistSong WHERE PlaylistID=? AND PlaylistSong.SongID=?', [playlistId, songId]);
            if (result.length > 0) {
                res.end("Song has already been added to this playlist");
                return;
            }

            await executeQuery('INSERT INTO PlaylistSong (PlaylistID, SongID) VALUES (?,?)', [playlistId, songId]);

            const albumId = await executeQuery('SELECT AlbumID FROM Song WHERE SongID=?', [songId]);

            res.writeHead(302, { Location: `/album/${albumId[0].AlbumID}` });
            res.end("Song successfully added to playlist");

        } catch (error) {
            console.error(error);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end("Internal Server Error");
        }
    } else if (matchUrl(req.url, '/playlist/([0-9]+)/remove') && req.method === 'GET') {
        const playlistId = req.url.split('/')[2];

        try {
            const results = await executeQuery('SELECT PlaylistID FROM Playlist WHERE PlaylistID=? AND UserID=? AND Deleted=0', [playlistId, sessionData.id]);
            if (results.length > 0) {
                await executeQuery('UPDATE Playlist SET Deleted=1 WHERE PlaylistID=?', [playlistId]);

                res.writeHead(200);
                res.end("Playlist successfully removed");
                return;
            }

            res.writeHead(401);
            res.end("Could not remove playlist");
        } catch (error) {
            console.error(error);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end("Internal Server Error");
        }

    } else if (matchUrl(req.url, '/playlist/([0-9]+)/remove/([0-9]+)') && req.method === 'GET') {
        const playlistId = req.url.split('/')[2];
        const songId = req.url.split('/')[4];
        if (getRole(sessionData) !== 'listener') {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end("You are not authorized to do that");
            return;
        }

        try {
            const result = await executeQuery('SELECT SongID, PlaylistID FROM PlaylistSong WHERE PlaylistID=? AND SongID=?', [playlistId, songId]);
            if (result.length === 0) {
                res.end("Song is not in this playlist");
                return;
            }

            await executeQuery('DELETE FROM PlaylistSong WHERE PlaylistID=? AND SongID=?', [playlistId, songId]);

            res.writeHead(302, { Location: `/playlist/${playlistId}` });
            res.end("Song successfully removed from playlist");

        } catch (error) {
            console.error(error);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end("Internal Server Error");
        }

    } else if (matchUrl(req.url, '/ajax/playlist/([0-9]+)') && req.method === 'GET') {
        const playlistId = req.url.split('/')[3];

        if (getRole(sessionData) !== 'listener') {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end("You are not authorized to do that");
            return;
        }

        try {
            const data = await getListenerBaseData(sessionData.id);

            // Get playlist details
            const playlistQuery = 'SELECT PlaylistID, PlaylistName, PlaylistDuration, Playlist.UserID, Username FROM Playlist,Listener WHERE PlaylistID=? AND Deleted=0 AND Playlist.UserID=Listener.UserID';
            const playlistResult = await executeQuery(playlistQuery, [playlistId]);

            data.playlist = playlistResult[0];
            data.username = sessionData['username'];
            data.owned = false;

            if (data.playlist['UserID'] == sessionData.id) {
                data.owned = true;
            }

            const duration_min = Math.floor(data.playlist['PlaylistDuration'] / 60);
            const duration_sec = Math.floor(data.playlist['PlaylistDuration'] % 60);

            data.playlist_duration = `${duration_min} min ${duration_sec} sec`;

            // Get songs in the playlist
            const playlistSongsQuery = 'SELECT ROW_NUMBER() OVER (ORDER BY PlaylistSong.SongID) row_num, Name, ArtistName, Duration, Song.SongID,Song.flagged,Song.reviewed FROM Song, PlaylistSong, Artist, Album WHERE Song.SongID=PlaylistSong.SongID AND PlaylistSong.PlaylistID=? AND Song.AlbumID=Album.AlbumID AND Album.ArtistID=Artist.ArtistID';
            const playlistSongsResult = await executeQuery(playlistSongsQuery, [playlistId]);

            data.songs = playlistSongsResult.map(song => {
                const duration_min = Math.floor(song.Duration / 60);
                const duration_sec = song.Duration % 60;
                const duration_str = `${duration_min}:${duration_sec}`;

                //fixed the code in the playlist -Josh-edits
                return [song.row_num, (song.flagged === 1 && song.reviewed === 0) ? "Not Available - " + song.Name : song.Name, song.ArtistName, song.Duration, duration_str, song.SongID];
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

    } else if (matchUrl(req.url, '/playlist/([0-9]+)/pic') && req.method === 'GET') {
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
    } else if (matchUrl(req.url, '/playlist/create') && req.method === 'GET') {
        if (getRole(sessionData) !== 'listener') {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end("You are not authorized to do that");
            return;
        }

        serveStaticFile(res, './templates/create_playlist.html', "");
    } else if (matchUrl(req.url, '/playlist/create') && req.method === 'POST') {
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

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Playlist Succesfully Created' }));
        } catch (error) {
            console.error('Error creating playlist:', error);
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Playlist Creation Failed' }));
        }
    } else if (matchUrl(req.url, '/song/([0-9]+)') && req.method === 'GET') {
        try {
            const songId = req.url.split('/')[2];
            const query = `
                    SELECT SongID, Song.AlbumID, Name, AlbumName 
                    FROM Song, Album 
                    WHERE SongID = ? 
                    AND Album.AlbumID = Song.AlbumID`;
            // AND (Song.flagged = 0 OR Song.reviewed = 1)`;

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
    } else if (matchUrl(req.url, '/song/([0-9]+)/audio') && req.method === 'GET') {
        try {
            const songId = req.url.split('/')[2];
            const query = 'SELECT SongFile,Duration,flagged,reviewed FROM Song WHERE SongID=?';
            const vals = [songId];

            const results = await executeQuery(query, vals);

            if (results.length === 0) {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('Not found');
                return;
            }
            // console.log(results)

            const songFile = results[0]['SongFile'];
            //josh-edits
            //now when the song comes in 
            //if flagged or has not been reviewed
            //the person cannot play the song
            const flagged = results[0]['flagged'];
            const reviewed = results[0]['reviewed'];
            //console.log(flagged)

            if (songFile === null || songFile === undefined || (flagged === 1 && reviewed === 0)) {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('Not found');
                return;
            }
            //i changed to await// no issue 

            //print(songFile)

            const type = await fileTypeFromBuffer(songFile);


            // add to the listen history. full duration of the song for now
            if (getRole(sessionData) === 'listener') {
                await executeQuery('INSERT INTO ListenedToHistory (SongID,UserID,Duration) VALUES (?,?,?)', [songId, sessionData.id, results[0]['Duration']]);
            }

            res.writeHead(200, { 'Content-Type': type });

            res.end(songFile);
        } catch (error) {
            console.error('Error getting song file:', error);
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end('<h1>Internal Server Error</h1>');
        }
        //tried with a function 
        // const result = await fetchSongFile(req);

        // res.writeHead(result.statusCode, { 'Content-Type': result.type || 'text/html' });

        // if (result.error) {
        //     res.end(result.error);
        // } else {
        //     res.end(result.songFile, 'binary');
        // }
    } else if (matchUrl(req.url, '/album/create') && req.method === 'GET') {
        if (getRole(sessionData) !== 'artist') {
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
    }
    else if (matchUrl(req.url, '/song/upload') && req.method === "GET") {
        if (getRole(sessionData) !== 'artist') {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end("You are not authorized to do that");
            return;
        }

        else {
            serveStaticFile(res, './templates/upload_song.html', "");
        }
    }
    else if (matchUrl(req.url, '/song/upload') && req.method === "POST") {
        if (getRole(sessionData) !== 'artist') {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end("You are not authorized to do that");
            return;
        }

        else {
            try {
                const data = await getArtistBaseData(sessionData.id);

                const form = new Types.IncomingForm({ multiples: true });
                const { fields, files } = await parseFormAsync(form, req);

                let query = "INSERT INTO Song (Name, Duration, AlbumID, GenreCode, SongFile, ReleaseDate) VALUES (?, ?, ?, ?, ?, ?)";

                let valsQuery = "SELECT AlbumID, ReleaseDate FROM Album WHERE AlbumID = ?";
                let queryval = [fields.album];
                //console.log(fields.album);
                const albumInfo = await executeQuery(valsQuery, queryval);
                //console.log(albumInfo);

                const songAudio = await readFile(files.song.filepath);
                const duration = await getAudioDurationInSeconds(files.song.filepath);
                const ReleaseDate = albumInfo[0].ReleaseDate;
                //console.log(ReleaseDate);

                const vals = [`${fields.songName}`, duration, `${fields.album}`, `${fields.genre}`, songAudio, ReleaseDate];
                //console.log(vals);
                const result = await executeQuery(query, vals);

                //console.log(result);
                res.writeHead(302, { Location: '/song/upload' });
                res.end("Successfully uploaded song");
            }
            catch (error) {
                // Handle errors and send an error response
                console.error('Error:', error.message);
                res.status(500).json({ success: false, message: 'Internal Server Error' });
            }
        }
    }
    else if (matchUrl(req.url, '/album/create') && req.method === 'POST') {
        if (getRole(sessionData) !== 'artist') {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end("You are not authorized to do that");
            return;
        }

        const form = new Types.IncomingForm({ multiples: true });

        try {
            const { fields, files } = await parseFormAsync(form, req);

            const albumCover = await readFile(files.albumCover.filepath);

            const insertAlbumResults = await executeQuery('INSERT INTO Album (AlbumName, AlbumPic, ArtistID, ReleaseDate) VALUES (?,?,?,?)',
                [fields.albumName, albumCover, sessionData.id, fields.releaseDate]);
            const albumId = insertAlbumResults.insertId;

            if (fields.songNames !== undefined) {
                const songPromises = [];
                if (fields.songNames.length === 1) {
                    let file = files['songs[]'];
                    files['songs[]'] = []
                    files['songs[]'].push(file);
                }
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
            }

            res.writeHead(302, { Location: '/' });
            res.end("Successfully created album");

            // Remove album cover file after upload
            await removeFile(files.albumCover.filepath);
        } catch (error) {
            console.error('Error uploading album:', error);
            // res.writeHead(500, { 'Content-Type': 'text/html' })
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