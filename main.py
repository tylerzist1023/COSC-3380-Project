from flask import Flask, render_template
import pymssql

conn = pymssql.connect(
    server='coogmusicserver.database.windows.net',
    user='CloudSA5fb1e56b',
    password='Coogs4lyfe!',
    database='coogmusic',
    as_dict=True
)  
cursor = conn.cursor()

app = Flask(__name__, static_url_path='', static_folder='static/')

@app.route('/')
def index():
    cursor.execute('SELECT * FROM artist')
    data = cursor.fetchall()
    return render_template('index.html', name=data)

@app.route('/listener')
def home():
    return render_template('listener.html')

@app.route('/login')
def login():
    return render_template('login.html')

@app.route('/register')
def register():
    return render_template('register.html')

@app.route('/listener/profile')
def profile_listener():
    return render_template('profile_listener.html')

if __name__ == '__main__':
    app.run(debug=True)