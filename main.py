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

if __name__ == '__main__':
    app.run(debug=True)

