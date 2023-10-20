use coogmusic;

-- Drop statements for tables if they exist
DROP TABLE IF EXISTS PlaylistSong;
DROP TABLE IF EXISTS Playlist;
DROP TABLE IF EXISTS Rating;
DROP TABLE IF EXISTS ListenedToHistory;
DROP TABLE IF EXISTS Song;
DROP TABLE IF EXISTS Follow;
DROP TABLE IF EXISTS Album;
DROP TABLE IF EXISTS Artist;
DROP TABLE IF EXISTS AlbumSong;
DROP TABLE IF EXISTS Admin;
DROP TABLE IF EXISTS Listener;
DROP TABLE IF EXISTS Genre;

-- Table: Admin
CREATE TABLE Admin (
    AdminID INT AUTO_INCREMENT PRIMARY KEY,
    Fname VARCHAR(50),
    Lname VARCHAR(50),
    Email VARCHAR(100) NOT NULL,
    DOB DATE,
    Username VARCHAR(50) NOT NULL,
    Password VARCHAR(50) NOT NULL,
    Pnumber CHAR(10),
    CreationStamp DATETIME NOT NULL,
    UNIQUE (Email, Username),
    -- CONSTRAINT CK_Admin_CreationStamp CHECK (CreationStamp <= NOW()),
    CONSTRAINT CK_Admin_Email CHECK (Email LIKE '%@cougarnet.uh.edu'),
    CONSTRAINT CK_Admin_Password CHECK (LENGTH(Password) >= 8 AND LENGTH(Password) <= 50 AND Password REGEXP '[0-9]' AND Password REGEXP '[a-z]' AND Password REGEXP '[A-Z]' AND Password REGEXP '[^a-zA-Z0-9]'),
    CONSTRAINT CK_Admin_Username CHECK (LENGTH(Username) >= 4 AND LENGTH(Username) <= 50)
);

-- Table: Artist
CREATE TABLE Artist (
    ArtistID INT AUTO_INCREMENT PRIMARY KEY,
    ArtistName VARCHAR(50) NOT NULL,
    Email VARCHAR(100) NOT NULL,
    DOB DATE,
    UserName VARCHAR(50) NOT NULL,
    Password VARCHAR(50) NOT NULL,
    Pnumber CHAR(10),
    ProfilePic LONGBLOB,
    Bio VARCHAR(250),
    CreationStamp DATETIME NOT NULL,
    UNIQUE (UserName, Email),
    -- CONSTRAINT CK_Artist_CreationStamp CHECK (CreationStamp <= NOW()),
    -- CONSTRAINT CK_Artist_DOB CHECK (DOB < NOW()),
    CONSTRAINT CK_Artist_Password CHECK (LENGTH(Password) >= 8 AND LENGTH(Password) <= 50 AND Password REGEXP '[0-9]' AND Password REGEXP '[a-z]' AND Password REGEXP '[A-Z]' AND Password REGEXP '[^a-zA-Z0-9]'),
    CONSTRAINT CK_Artist_Username CHECK (LENGTH(UserName) >= 4 AND LENGTH(UserName) <= 50)
);

-- Table: Listener
CREATE TABLE Listener (
    UserID INT AUTO_INCREMENT PRIMARY KEY,
    Fname VARCHAR(50),
    Lname VARCHAR(50),
    Email VARCHAR(100) NOT NULL,
    DOB DATE,
    Username VARCHAR(50) NOT NULL,
    Password VARCHAR(50) NOT NULL,
    Pnumber CHAR(10),
    ProfilePic LONGBLOB,
    Bio VARCHAR(250),
    CreationStamp DATETIME NOT NULL,
    UNIQUE (Username, Email),
    -- CONSTRAINT chk_creationstamp CHECK (CreationStamp <= NOW()),
    -- CONSTRAINT chk_dob CHECK (DOB <= NOW()),
    CONSTRAINT chk_email CHECK (Email REGEXP '^.+@.+\..+$'),
    CONSTRAINT chk_password CHECK (LENGTH(Password) >= 8 AND LENGTH(Password) <= 50 AND Password REGEXP '[0-9]' AND Password REGEXP '[a-z]' AND Password REGEXP '[A-Z]' AND Password REGEXP '[^a-zA-Z0-9]'),
    CONSTRAINT chk_phonenum CHECK (Pnumber REGEXP '^[0-9]{10}$'),
    CONSTRAINT chk_usernamelen CHECK (LENGTH(Username) >= 4 AND LENGTH(Username) <= 50)
);

-- Table: Album
CREATE TABLE Album (
    AlbumID INT PRIMARY KEY,
    AlbumName VARCHAR(50) NOT NULL,
    ArtistID INT NOT NULL,
    AlbumPic LONGBLOB,
    ReleaseDate DATE,
    AlbumDuration INT NOT NULL,
    -- CONSTRAINT CK_AlbumReleaseDate CHECK (ReleaseDate <= NOW()),
    FOREIGN KEY (ArtistID) REFERENCES Artist(ArtistID)
);

-- Table: Genre
CREATE TABLE Genre (
    GenreCode INT PRIMARY KEY,
    Name VARCHAR(50) NOT NULL
);

-- Table: Song
CREATE TABLE Song (
    SongID INT PRIMARY KEY,
    Name VARCHAR(100) NOT NULL,
    Duration INT NOT NULL,
    AlbumID INT NOT NULL,
    GenreCode INT NOT NULL,
    ReleaseDate DATE,
    AverageRating NUMERIC(3, 2),
    CONSTRAINT CK_SongDuration CHECK (Duration > 0 AND Duration <= 1200),
    -- CONSTRAINT CK_SongReleaseDate CHECK (ReleaseDate <= NOW()),
    FOREIGN KEY (AlbumID) REFERENCES Album(AlbumID),
    FOREIGN KEY (GenreCode) REFERENCES Genre(GenreCode)
);

-- Table: Follow
CREATE TABLE Follow (
    UserID INT NOT NULL,
    ArtistID INT NOT NULL,
    FollowDate DATETIME NOT NULL,
    -- CONSTRAINT CK_FollowDate CHECK (FollowDate <= NOW()),
    PRIMARY KEY (UserID, ArtistID),
    FOREIGN KEY (UserID) REFERENCES Listener(UserID),
    FOREIGN KEY (ArtistID) REFERENCES Artist(ArtistID)
);



-- Table: ListenedToHistory
CREATE TABLE ListenedToHistory (
    UserID INT NOT NULL,
    SongID INT NOT NULL,
    DateAccessed DATETIME NOT NULL,
    Duration INT NOT NULL,
    -- CONSTRAINT chk_dateaccessed CHECK (DateAccessed <= NOW()),
    PRIMARY KEY (UserID, SongID),
    FOREIGN KEY (UserID) REFERENCES Listener(UserID),
    FOREIGN KEY (SongID) REFERENCES Song(SongID)
);

-- Table: Playlist
CREATE TABLE Playlist (
    PlaylistID INT PRIMARY KEY,
    UserID INT NOT NULL,
    PlaylistName VARCHAR(50) NOT NULL,
    PlaylistDuration INT NOT NULL,
    PlaylistCreationDate DATE NOT NULL,
    -- CONSTRAINT CK_PlaylistCreationDate CHECK (PlaylistCreationDate <= NOW()),
    FOREIGN KEY (UserID) REFERENCES Listener(UserID)
);

-- Table: PlaylistSong
CREATE TABLE PlaylistSong (
    PlaylistID INT NOT NULL,
    SongID INT NOT NULL,
    PRIMARY KEY (PlaylistID, SongID),
    FOREIGN KEY (PlaylistID) REFERENCES Playlist(PlaylistID),
    FOREIGN KEY (SongID) REFERENCES Song(SongID)
);

-- Table: Rating
CREATE TABLE Rating (
    UserID INT NOT NULL,
    SongID INT NOT NULL,
    Value INT NOT NULL,
    CONSTRAINT CK_Rating CHECK (Value >= 1 AND Value <= 5),
    PRIMARY KEY (UserID, SongID),
    FOREIGN KEY (UserID) REFERENCES Listener(UserID),
    FOREIGN KEY (SongID) REFERENCES Song(SongID)
);