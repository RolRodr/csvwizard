const BACKEND_PORT = 5000; // From your run-dev.sh
const API_BASE_URL = `http://localhost:${BACKEND_PORT}/api/csv`;
const LS_SIDEBAR_COLLAPSED_KEY = 'csvwizard_sidebar_collapsed';

const LS_CSV_RAW_KEY = 'csvWizardRawData';
const LS_TRANSFORMATIONS_KEY = 'csvWizardTransformations';

// Function to save state to localStorage
function saveState() {
    if (csvRaw) {
        localStorage.setItem(LS_CSV_RAW_KEY, csvRaw);
        localStorage.setItem(LS_TRANSFORMATIONS_KEY, JSON.stringify(transformations));
        console.log("State saved to localStorage.");
    }
}

// Function to load state from localStorage
async function loadState() {
    const storedCsvRaw = localStorage.getItem(LS_CSV_RAW_KEY);
    const storedTransformations = localStorage.getItem(LS_TRANSFORMATIONS_KEY);

    if (storedCsvRaw && storedTransformations) {
        console.log("Loading state from localStorage...");
        csvRaw = storedCsvRaw;
        try {
            transformations = JSON.parse(storedTransformations);
            if (!Array.isArray(transformations)) { // Basic validation
                console.warn("Stored transformations were not an array, resetting.");
                transformations = [];
            }
        } catch (e) {
            console.error("Error parsing stored transformations, resetting.", e);
            transformations = [];
            Array.from(transformButtons).forEach(btn => btn.disabled=true);
        }

        if (csvRaw) {
            
            loadingIndicator.style.display = 'block';
            await refreshPreview(); // This will also render transforms and preview
            loadingIndicator.style.display = 'none';
            console.log("State loaded and UI updated.");
        }
    } else {
        console.log("No saved state found in localStorage.");
    }
}


// Function to toggle sidebar
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.querySelector('.main-content');
    const toggleButton = document.getElementById('toggle-sidebar-btn');

    sidebar.classList.toggle('collapsed');
    mainContent.classList.toggle('sidebar-collapsed');
    toggleButton.classList.toggle('sidebar-expanded'); // To move the button itself

    if (sidebar.classList.contains('collapsed')) {
        localStorage.setItem(LS_SIDEBAR_COLLAPSED_KEY, 'true');
        toggleButton.innerHTML = '☰'; // Menu icon
    } else {
        localStorage.setItem(LS_SIDEBAR_COLLAPSED_KEY, 'false');
        toggleButton.innerHTML = '✕'; // Close icon
    }
}

// Function to initialize sidebar state from localStorage
function initializeSidebarState() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.querySelector('.main-content');
    const toggleButton = document.getElementById('toggle-sidebar-btn');
    const isCollapsed = localStorage.getItem(LS_SIDEBAR_COLLAPSED_KEY) === 'true';

    if (isCollapsed) {
        sidebar.classList.add('collapsed');
        mainContent.classList.add('sidebar-collapsed');
        toggleButton.classList.remove('sidebar-expanded'); // Ensure button is in correct initial spot
        toggleButton.innerHTML = '☰';
    } else {
        sidebar.classList.remove('collapsed');
        mainContent.classList.remove('sidebar-collapsed');
        toggleButton.classList.add('sidebar-expanded'); // Ensure button is in correct initial spot
        toggleButton.innerHTML = '✕';
    }
}

let csvRaw = "";
let headers = [];
let transformations = [];
let previewData = [];
const loadingIndicator = document.getElementById('loading-indicator');
const csvFileInput = document.getElementById('csvfile');
const transformButtons = document.getElementsByClassName("transform-btn")

csvFileInput.onchange = async function (evt) {
    const file = evt.target.files[0];
    if (!file) return;

    loadingIndicator.style.display = 'block';
    console.log(`File selected: ${file.name}. Starting upload to /api/csv/upload...`);
    let alertshown = false;
    try {
        const formData = new FormData();
        formData.append('file', file);

        let resp = await fetch(`${API_BASE_URL}/upload`, { method: 'POST', body: formData });
        console.log(`Upload request sent. Server responded with status: ${resp.status}`);
        const responseText = await resp.text();
        if (!resp.ok) {
            console.error("Failed to upload file:", resp.statusText);
            alert("Error uploading file. Please try again.");
            alertshown = true;
            throw new Error(`Upload failed: ${resp.status}`);
            return;
        }
        let json;
        try {
            json = JSON.parse(responseText);
        } catch (e) {
            console.error("Failed to parse JSON response:", e);
            alert("Invalid response from server. Please try again.");
            alertshown = true;
            return;
        }
        if (typeof json.csv !== 'string') {
            console.error("Invalid response format. Expected 'csv' field in JSON.");
            alert("Invalid response from server. Please try again.");
            alertshown = true;
            throw new Error("Invalid upload response structure: missing 'csv' string.");
            return;
        }
        csvRaw = json.csv;
        transformations = [];

        console.log('Raw CSV data received. Calling refreshPreview to process and display initial data...');
        await refreshPreview();
        
        // Enables the transformation buttons once the CSV is loaded
        Array.from(transformButtons).forEach(btn => btn.disabled = false);


    } catch (error) {
        console.error("Error during file upload:", error);
        if (!alertShown) { // Show a generic alert only if a specific one wasn't shown
            alert("An error occurred during file upload. Please check the console for details.");
        }
    } finally {
        loadingIndicator.style.display = 'none';
        console.log('Initial file processing sequence finished.');
    }
};

async function refreshPreview() {
    loadingIndicator.style.display = 'block';
    console.log(`Refreshing preview. Sending data to ${API_BASE_URL}/transform...`);
    let alertShown = false;
    try {
        let resp = await fetch(`${API_BASE_URL}/transform`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ csv: csvRaw, transformations: transformations })
        });
        console.log(`Transform request sent. Server responded with status: ${resp.status}`);
        const responseText = await resp.text();
        
        if (!resp.ok) {
            console.error("Transform API failed:", resp.status, resp.statusText, responseText);
            alert(`Error refreshing preview: ${resp.status} ${resp.statusText}\n${responseText}`);
            alertShown = true;
            throw new Error(`Transform API failed: ${resp.status}`);
        }

        let json;
        try {
            json = JSON.parse(responseText);
        } catch (parseError) {
            console.error("Error parsing JSON response from /transform. Raw text:", responseText, parseError);
            alert("Error processing server response from transform. Not valid JSON. Check console.");
            alertShown = true;
            throw parseError;
        }

        if (!json.preview || !Array.isArray(json.preview)) {
                console.error("Response from /transform is missing 'preview' array property:", json);
            alert("Invalid response structure from server after transform. Expected 'preview' array. Check console.");
            alertShown = true;
            throw new Error("Invalid transform response structure: missing 'preview' array.");
        }

        previewData = json.preview;
        renderPreview(previewData); // renderPreview expects the array of arrays
        renderTransforms();
        saveState(); // Save the current state after rendering
        console.log('Preview and transformations list rendered.');
    } catch (error) {
        console.error('Error refreshing preview:', error);
        if (!alertShown) {
            alert(`An error occurred while refreshing the preview. Please check the console.`);
        }
    } finally {
        loadingIndicator.style.display = 'none';
        console.log('Preview refresh sequence finished.');
    }
}

function renderPreview(data) {
    let table = document.getElementById('csv-preview');
    table.innerHTML = "";
    data.forEach((row, i) => {
        let tr = document.createElement('tr');
        row.forEach(cell => {
            let td = document.createElement(i === 0 ? 'th' : 'td');
            td.textContent = cell;
            tr.appendChild(td);
        });
        table.appendChild(tr);
    });
    headers = data[0] || [];
}

function renderTransforms() {
    let list = document.getElementById('transform-list');
    list.innerHTML = "";
    transformations.forEach((t, idx) => {
        let div = document.createElement('div');
        div.className = "transform-entry";
        div.innerHTML = 
            `<b>${idx + 1}.</b> ${t.Type} on <code>${t.Column}</code>` + 
            (t.Type === "explode" ? ` (delimiter: <code>${t.Delimiter}</code>)` : "") + 
            ` <a href="#" onclick="removeTransform(${idx});return false;">Undo</a>`;
        list.appendChild(div);
    });
}

window.removeTransform = async function(idx) {
    console.log(`Removing transform at index ${idx}.`);
    transformations.splice(idx, 1);
    await refreshPreview(); // refreshPreview will call saveState
    console.log('Transform removed, preview updated.');
};

async function addTransform(type) {
    if (!headers.length) return;
    let col = prompt("Enter column name or index (starting from 0):\n" + 
        headers.map((h,i) => `${i}: ${h}`).join("\n") + 
        "\n\n Enter \"all\" to apply to all columns."
    );
    if (col === null || col === "") return;
    if (type === "explode") {
        let delim = prompt("Enter delimiter for splitting (e.g. ; or |):", ";");
        if (!delim) return;
        transformations.push({ Type: type, Column: col, Delimiter: delim });
    } else {
        transformations.push({ Type: type, Column: col });
    }
    await refreshPreview();
}

document.getElementById('add-delete').onclick = () => addTransform("delete");
document.getElementById('add-normalize').onclick = () => addTransform("normalize");
document.getElementById('add-explode').onclick = () => addTransform("explode");
// document.getElementById('add-address').onclick = () => addTransform("explode_address");
// document.getElementById('add-name').onclick = () => addTransform("explode_name");
document.getElementById('download').onclick = async function() {
    loadingIndicator.style.display = 'block';
    console.log(`Download requested. Requesting final transformed CSV from ${API_BASE_URL}/transform...`);
    let alertShown = false;
    try {
        let resp = await fetch(`${API_BASE_URL}/transform`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ csv: csvRaw, transformations: transformations })
        });
        console.log(`Transform for download request sent. Server responded with status: ${resp.status}`);
        const responseText = await resp.text();

        if (!resp.ok) {
            console.error("Transform API for download failed:", resp.status, resp.statusText, responseText);
            alert(`Error preparing download: ${resp.status} ${resp.statusText}\n${responseText}`);
            alertShown = true;
            throw new Error(`Transform API for download failed: ${resp.status}`);
        }

        let json;
        try {
            json = JSON.parse(responseText);
        } catch (parseError) {
            console.error("Error parsing JSON response from /transform (for download). Raw text:", responseText, parseError);
            alert("Error processing server response for download. Not valid JSON. Check console.");
            alertShown = true;
            throw parseError;
        }
        
        if (typeof json.csv !== 'string') {
            console.error("Response from /transform (for download) is missing 'csv' string property:", json);
            alert("Invalid response structure from server for download. Expected 'csv' string. Check console.");
            alertShown = true;
            throw new Error("Invalid download response structure: missing 'csv' string.");
        }

        let blob = new Blob([json.csv], { type: 'text/csv;charset=utf-8;' });
        let url = URL.createObjectURL(blob);
        let a = document.createElement('a');
        a.href = url;
        a.download = "normalized.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('File "normalized.csv" download initiated.');
    } catch (error) {
        console.error('Error during download process:', error);
        if (!alertShown) {
            alert(`An error occurred while preparing the download. Please check the console.`);
        }
    } finally {
        loadingIndicator.style.display = 'none';
        console.log('Download sequence finished.');
    }
};

// DOMContentLoaded listener
document.addEventListener('DOMContentLoaded', () => {
    initializeSidebarState(); // Initialize sidebar first
    loadState()
    const toggleButton = document.getElementById('toggle-sidebar-btn');
    if (toggleButton) {
        toggleButton.addEventListener('click', toggleSidebar);
    }
});