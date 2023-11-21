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


        const NewSongQuery = 'SELECT SongID,Song.Name AS SongName, Artist.ArtistName as ArtistName, Artist.ProfilePic as ProfilePic FROM Song JOIN Artist ON Song.ArtistID = Artist.ArtistID ORDER BY Song.CreationTimestamp';
        const NewSongResults = await executeQuery(NewSongQuery);
        

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




export { getAdminArtist};