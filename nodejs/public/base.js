function getTopbar(data) {
    return `<div class="topbar">
        <ul class="topbar_navigation">
            <li>
                <a href="/">
                    <span>Hello ${data.username}!</span>
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
                <a href="/listenhistory">
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
}

function getSidebar(data) {
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
                                <a href='/artist/${follow['ArtistID']}'><span>${follow['ArtistName']}</span></a>
                            </li>`;
                        }
                            html += `
                        </ul>
                    </li>
                </ul>
            </div>`;
            return html;
}