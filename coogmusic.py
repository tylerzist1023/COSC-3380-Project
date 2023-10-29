from flask import Flask, render_template, request, url_for, redirect, session, send_file
from jinja2.utils import urlize 
import pymysql
from datetime import datetime,date
from io import BytesIO
import magic

f = None
try:
    f = open('coogmusic.env', 'r')
except:
    print("coogmusic.env not found. Create a new file called coogmusic.env, and put the host, username, password, database in this new file, each separated by line")
    exit(1)

env_lines = f.read().splitlines()

conn = pymysql.connect(
        host=env_lines[0].strip(),
        user=env_lines[1].strip(),
        password=env_lines[2].strip(),
        database=env_lines[3].strip()
    )
cursor = conn.cursor()

app = Flask(__name__, static_url_path='', static_folder='static/')
app.secret_key = '}dMpN?XNRqzV?y!)&[%E!;cRDPtSFW'

mime_detector = magic.Magic()

@app.route('/')
def index():
    name = "sign in"
    role = None
    id_ = None
    if 'logged_in' in session and session['logged_in']:
        name = session['username']
        role = session['role']
        id_ = session['id']

    return render_template('index.html', name=name, role=role, id_=id_)

@app.route('/login', methods=['GET'])
def get_login():
    role = request.args.get('role')

    if role is None or role == 'listener':
        return render_template('login.html', role='listener')
    elif role == 'artist':
        return render_template('login.html', role='artist')
    return "Not found"

@app.route('/register', methods=['GET'])
def get_register():
    role = request.args.get('role')

    if role is None or role == 'listener':
        return render_template('register.html', role='listener')
    elif role == 'artist':
        return render_template('register.html', role='artist')
    return "Not found"

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('index'))

@app.route('/login', methods=['POST'])
def post_login():
    query = None
    vals = None
    role = request.args.get('role')

    if role is None or role == 'listener':
        query = 'select * from Listener where Username=%s and Password=%s'
        vals = (request.form['username'], request.form['password'])
    elif role == 'artist':
        query = 'select * from Artist where Username=%s and Password=%s'
        vals = (request.form['username'], request.form['password'])
    else:
        return redirect(url_for('get_login', role=[role]))

    cursor.execute(query, vals)
    user = cursor.fetchone()

    if user is None:
        return redirect(url_for('get_login', role=[role]))
    else:
        session.clear()
        if role is None or role == 'listener':
            session['id'] = user[0]
        elif role == 'artist':
            session['id'] = user[0]
        session['role'] = role
        session['logged_in'] = True
        session['username'] = request.form['username']
        return redirect(url_for('index'))

@app.route('/register', methods=['POST'])
def post_register():
    query = None
    vals = None
    role = request.args.get('role')

    if role is None or role == 'listener':
        query = 'INSERT INTO Listener (Fname, Lname, Email, DOB, Username, Password, Pnumber, ProfilePic, Bio) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)'
        vals = (request.form['first'], request.form['last'], request.form['email'], request.form['DOB'], request.form['username'], request.form['password'], request.form['pnum'], None, None)
        result_query = "SELECT * FROM Listener WHERE UserID = LAST_INSERT_ID()"
    elif role == 'artist':
        query = 'INSERT INTO Artist (ArtistName, Email, DOB, UserName, Password, Pnumber, ProfilePic, Bio) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)'
        vals = (request.form['name'], request.form['email'], request.form['DOB'], request.form['username'], request.form['password'], request.form['pnum'], None, None)
        result_query = "SELECT * FROM Artist WHERE ArtistID = LAST_INSERT_ID()"
    else:
        return redirect(url_for('get_register', role=[role]))

    cursor.execute(query, vals)
    cursor.execute(result_query)
    result = cursor.fetchone()
    conn.commit()

    session.clear()
    if role is None or role == 'listener':
        session['id'] = result[0]
    elif role == 'artist':
        session['id'] = result[0]
    session['role'] = role
    session['username'] = request.form['username']
    session['logged_in'] = True

    return redirect(url_for('index'))

@app.route('/artist/<artist_id>', methods=['GET'])
def get_artist(artist_id):
    query = 'select ArtistID from Artist where ArtistID=%s'
    vals = (artist_id)
    cursor.execute(query, vals)
    result = cursor.fetchone()
    conn.commit()

    return str(result)

@app.route('/album/<album_id>', methods=['GET'])
def get_album(album_id):
    query = 'select AlbumID from Album where AlbumID=%s'
    vals = (album_id)
    cursor.execute(query, vals)
    result = cursor.fetchone()
    conn.commit()

    return str(result)

@app.route('/song/<song_id>', methods=['GET'])
def get_song(song_id):
    query = 'select SongID from Song where SongID=%s'
    vals = (song_id)
    cursor.execute(query, vals)
    result = cursor.fetchone()
    conn.commit()

    if result:
        return render_template('song_test.html', song_id=song_id)
    else:
        return "Song not found", 404

def get_file(buffer):
    file = BytesIO(buffer)
    file.seek(0)
    mimetype = mime_detector.from_buffer(buffer)

    return (file,mimetype)

@app.route('/song/<song_id>/audio', methods=['GET'])
def get_song_file(song_id):
    query = 'select SongFile from Song where SongID=%s'
    vals = (song_id)
    cursor.execute(query, vals)
    result = cursor.fetchone()
    conn.commit()

    if not result or result[0] is None:
        return "Song file not found", 404

    (file, mimetype) = get_file(result[0])

    return send_file(file, mimetype=mimetype)

@app.route('/artist/<artist_id>/pic', methods=['GET'])
def get_artist_pic(artist_id):
    query = 'select ProfilePic from Artist where ArtistID=%s'
    vals = (artist_id)
    cursor.execute(query, vals)
    result = cursor.fetchone()
    conn.commit()

    if not result or result[0] is None:
        return "Artist pic not found", 404

    (file, mimetype) = get_file(result[0])

    return send_file(file, mimetype=mimetype)

@app.route('/album/<album_id>/pic', methods=['GET'])
def get_album_pic(album_id):
    query = 'select AlbumPic from Album where AlbumID=%s'
    vals = (album_id)
    cursor.execute(query, vals)
    result = cursor.fetchone()
    conn.commit()

    if not result or result[0] is None:
        return "Album pic not found", 404

    (file, mimetype) = get_file(result[0])

    return send_file(file, mimetype=mimetype)

@app.route('/playlist/<playlist_id>', methods=['GET'])
def get_playlist(playlist_id):
    query = 'select * from Playlist where PlaylistID=%s'
    vals = (playlist_id)
    cursor.execute(query, vals)
    result = cursor.fetchone()
    conn.commit()

    return str(result)

@app.route('/song/<song_id>/rate', methods=['POST'])
def rate_song(song_id):
    if not ('logged_in' in session and session['logged_in'] and session['role'] == 'listener'):
        return "You are not authorized to do that", 401
    if not ('rating' in request.form):
        return "Specify the rating in the form please", 400

    query = 'SELECT * FROM Rating WHERE SongID=%s AND UserID=%s'
    vals = (song_id, session['id'])
    cursor.execute(query, vals)
    result = cursor.fetchone()
    print(result)

    if result is not None:
        query = 'UPDATE Rating SET Value=%s WHERE SongID=%s AND UserID=%s'
        vals = (request.form['rating'], song_id, session['id'])
        cursor.execute(query, vals)
    else:
        query = 'INSERT INTO Rating (UserID, SongID, Value) VALUES (%s,%s,%s)'
        vals = (session['id'], song_id, request.form['rating'])
        cursor.execute(query, vals)

    conn.commit()

    return "", 200

if __name__ == '__main__':
    try:
        app.jinja_env.trim_blocks = True
        app.jinja_env.lstrip_blocks = True
        app.run(debug=True, host='127.0.0.1', port=5000)
        conn.close()
    except:
        conn.close()