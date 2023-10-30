// Define content for different time frames
const contentData = {
    weekly: [
        { name: "Song 1", artist: "Artist 1" },
        { name: "Song 2", artist: "Artist 2" },
        // Add more content for the weekly time frame
    ],
    monthly: [
        { name: "Song 3", artist: "Artist 3" },
        { name: "Song 4", artist: "Artist 4" },
        // Add more content for the monthly time frame
    ],
    daily: [
        { name: "Song 5", artist: "Artist 5" },
        { name: "Song 6", artist: "Artist 6" },
        // Add more content for the daily time frame
    ],
};

// Function to update the displayed content
function updateContent(timeFrame) {
    const contentContainer = document.getElementById("filteredContent");
    contentContainer.innerHTML = ""; // Clear the container

    contentData[timeFrame].forEach(item => {
        const itemElement = document.createElement("div");
        itemElement.innerHTML = `
            <p>${item.name} - ${item.artist}</p>
        `;
        contentContainer.appendChild(itemElement);
    });
}

// Listen for changes in the select dropdown
const timeFrameSelector = document.getElementById("timeFrameSelector");
timeFrameSelector.addEventListener("change", function () {
    const selectedTimeFrame = this.value;
    updateContent(selectedTimeFrame);
    hideAllContent(); // Hide all content
    showContent(selectedTimeFrame); // Show content for the selected time frame
});

// Function to hide all content
function hideAllContent() {
    const contentDivs = document.querySelectorAll('.content');
    contentDivs.forEach((div) => {
        div.style.display = 'none';
    });
}

// Function to show content based on the selected time frame
function showContent(timeFrame) {
    document.getElementById(`${timeFrame}Content`).style.display = 'block';
}

// Initial load with the default time frame (e.g., weekly)
updateContent("weekly");
hideAllContent(); // Hide all content initially
showContent("weekly"); // Show content for the default time frame
