function getTopbar(x) {
    fetch('/topbar')
    .then((response) => response.text())
    .then((data) => {
        document.getElementById('topBar').innerHTML = data;
    });
}

function getSidebar(x) {
    fetch('/sidebar')
    .then((response) => response.text())
    .then((data) => {
        document.getElementById('leftBar').innerHTML = data;
    });
}
let currentSongIndex = null;
function playSong(this_) {
    if(this_ === null || this_ === undefined) {
        return function(e) { e.preventDefault();};
    }

    return function(e) {
       if(e) e.preventDefault();

        let songid = this_.getAttribute('songid');
        currentSongIndex = parseInt(this_.getAttribute('ii'));
        
        fetch('/song/'+songid)
            .then(response => response.json())
            .then(data => {
                console.log('Data received from /song/:id endpoint:', data);
                let playerImage = document.getElementById('playerImage');
                let playerSong = document.getElementById('playerSong');
                let playerArtist = document.getElementById('playerArtist');
                let playerSource = document.getElementById('playerSource');
                let playerList = document.getElementById(`list${songid}`);

                playerImage.src = '/album/' + data['albumid'] + '/pic';
                playerSong.textContent = data['songname'];
                playerArtist.textContent = data['artistname'];

                // Resetting background color for all track lists
                const trackLists = document.querySelectorAll('.track_list');
                for (let i = 0; i < trackLists.length; i++) {
                    trackLists[i].style.backgroundColor = '#111727';
                }
                playerList.style.backgroundColor = '#636363';

                playerSource.setAttribute('src', '/song/'+songid+'/audio');
                playerSong.innerHTML = data['songname'];
                playerArtist.innerHTML = data['artistname'];
            })
            .catch(error => console.error('Error:', error))
            .finally(() => {
                let playerAudio = document.getElementById('playerAudio');
                playerAudio.load();
                playerAudio.play();
                let playerDiv = document.getElementById('playerDiv');
                playerDiv.style.display = '';
            });
    };
}

// Functions to play the next and previous songs
function playNextSong() {
    if (currentSongIndex !== null) {
        let nextSongLink = document.querySelector(`[ii="${currentSongIndex + 1}"]`);
        if (nextSongLink) {
            playSong(nextSongLink)(); // Call the inner function directly
        }
    }
}

function playPrevSong() {
    if (currentSongIndex !== null) {
        let prevSongLink = document.querySelector(`[ii="${currentSongIndex - 1}"]`);
        if (prevSongLink) {
            playSong(prevSongLink)(); // Call the inner function directly
        }
    }
}



// Initialize event listeners for next and previous buttons
document.getElementById('nextSong').addEventListener('click', playNextSong);
document.getElementById('prevSong').addEventListener('click', playPrevSong);



