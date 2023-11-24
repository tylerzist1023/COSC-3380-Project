import http from 'http';
import fs from 'fs';
import fetch from 'node-fetch';
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
import { match } from 'assert';
let pool = mysql.createPool({
    host: "thejjx.com",
    user: "coogmusic",
    password: "coogs4ever@ever!",
    database:"coogmusic",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    idleTimeout:20*1000
});
async function executeQuery(query, values) {
    const connection = await pool.getConnection();
    try {
        const [rows, fields] = await connection.execute(query, values);
        return rows;
    } finally {
        connection.release();
    }
}
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






export { getAdminArtist,getAdminSong,getAdminListener};