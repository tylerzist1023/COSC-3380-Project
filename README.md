# Coog Music

## TODO

### Endpoints

- [ ] /listener
    - [ ] GET /register
        - [ ] Render account_register.html
    - [ ] POST /register
        - [ ] Validate form data
        - [ ] Check if artist does not exist
        - [ ] Insert new listener SQL query
        - [ ] Start flask session
        - [ ] Redirect to /listener/profile
        - Email confirmation?
    - [ ] GET /login
        - [ ] Render account_login.html
    - [ ] POST /login
        - [ ] Validate form data
        - [ ] Start flask session
        - [ ] Redirect to /listener/profile
    - [ ] GET /logout
        - [ ] Remove flask session
        - [ ] Redirect to /
    - [ ] GET /reset
        - [ ] Render account_reset.html
    - [ ] POST /reset
        - Reset through email?
    - [ ] GET /delete
        - [ ] Render account_delete.html
    - [ ] POST /delete
        - [ ] Validate the password is correct
        - [ ] Delete listener SQL query
        - [ ] Remove flask session
        - [ ] Redirect to /
    - [ ] GET /profile
        - [ ] Render profile_listener.html
    - [ ] POST /profile
        - [ ] Update listener information SQL query
        - Password verification?
    - [ ] POST /follow/:artist_id
        - [ ] Insert follow SQL query.
    - [ ] DELETE /follow/:artist_id
        - [ ] Delete follow SQL query.
    - [ ] POST /playlist
        - [ ] Insert new playlist SQL query
    - [ ] POST /playlist/:id
        - [ ] Update playlist information SQL query
    - [ ] DELETE /playlist/:id
        - [ ] Check that the listener owns the playlist
        - [ ] Delete playlist SQL query
    - [ ] GET /browse
        - [ ] Browse curated recommendations by follows and plays
    - [ ] /report
- [ ] /artist
    - [ ] GET /register
        - [ ] Render account_register.html
    - [ ] POST /register
        - [ ] Validate form data
        - [ ] Check if artist does not exist
        - [ ] Insert new artist SQL query
        - [ ] Start flask session
        - [ ] Redirect to /artist/profile
        - Email confirmation?
    - [ ] GET /login
        - [ ] Render account_login.html
    - [ ] POST /login
        - [ ] Validate form data
        - [ ] Start flask session
        - [ ] Redirect to /artist/profile
    - [ ] GET /logout
        - [ ] Remove flask session
        - [ ] Redirect to /
    - [ ] GET /reset
        - [ ] Render account_reset.html
    - [ ] POST /reset
        - Reset through email?
    - [ ] GET /delete
        - [ ] Render account_delete.html
    - [ ] POST /delete
        - [ ] Validate the password is correct
        - [ ] Delete artist SQL query
        - [ ] Remove flask session
        - [ ] Redirect to /
    - [ ] GET /profile
        - [ ] Render profile_artist.html
    - [ ] POST /profile
        - [ ] Update artist information SQL query
        - Password verification?
    - [ ] GET /upload
        - [ ] Render upload.html
    - [ ] POST /upload
        - [ ] Upload songs
        - [ ] Insert album SQL query
        - [ ] Insert song SQL queries
    - [ ] /report
- [ ] /admin
    - [ ] GET /register
        - [ ] Render account_register.html
    - [ ] POST /register
        - [ ] Validate form data
        - [ ] Check if admin does not exist
        - [ ] Insert new admin SQL query
        - [ ] Start flask session
        - [ ] Redirect to /admin/control
    - [ ] GET /login
        - [ ] Render account_login.html
    - [ ] POST /login
        - [ ] Validate form data
        - [ ] Start flask session
        - [ ] Redirect to /admin/control
    - [ ] GET /logout
        - [ ] Remove flask session
        - [ ] Redirect to /
    - [ ] /reset
        - Adding this could pose a security risk.
    - [ ] GET /control
        - [ ] Render control_admin.html
    - [ ] /report
- [ ] GET /search
- [ ] GET /song/:id
- [ ] GET /playlist/:id
- [ ] GET /artist/:id
- [ ] GET /album/:id

### HTML Templates

- [x] /index.html
- [x] /account_login.html
- [x] /account_register.html
- [ ] /account_reset.html
- [ ] /account_delete.html
- [x] /profile_listener.html
- [ ] /profile_artist.html
- [ ] /control_admin.html
- [ ] /search.html
- [ ] /song.html
- [ ] /browse.html
- [ ] /upload.html
- [x] /playlist.html
- [ ] /playlist_create.html
- [ ] /artist.html
- [ ] /listener_sidebar.html

### SQL Queries

- [ ] Insert listener
- [ ] Update listener
- [ ] Delete listener
- [ ] Insert artist
- [ ] Update artist
- [ ] Insert album
- [ ] Insert song (after the album is inserted)
- [ ] Delete album
- [ ] Insert playlist
- [ ] Insert song to playlist
- [ ] Delete song from playlist
- [ ] Select songs from playlist
- [ ] Insert admin
- [ ] Select from playlist,song by title,genre etc.
- [ ] Select all playlists by user
- [ ] Insert follow
- [ ] Delete follow

### SQL Triggers
- [ ] Playlist duration, num songs

### SQL Reports
- [ ] Listener plays by time
- [ ] Artist engagement
