console.log("user:", user, "scores_exist:",scores_exist, "placeify type:",type);

data_root = "data"
user_img_dir = `${data_root}/userdata/${user}/images/`;
user_gsv_dir = `${data_root}/files/processed/usergsv/`;
scores_dir = `${data_root}/userdata/${user}/scores/`;

configFile = `/getfile?filename=config.json&directory=${data_root}/`;
logFile = `/getfile?filename=log.txtn&directory=${data_root}/userdata/${user}/`;

var data; //set global variable for data
var analogies; //set global variable for analogies
var config; //set global variable for config


var user_locs = []; //list of locations chosen by user (upto 3)
var selected_features;

var ade20k_labels = ['wall', 'building', 'sky', 'floor', 'tree', 'ceiling', 'road', 'bed', 'window', 'grass', 'cabinet', 'sidewalk', 'person', 'earth', 'door', 'table', 'mountain', 'plant', 'curtain', 'chair', 'car', 'water', 'painting', 'sofa', 'shelf', 'house', 'sea', 'mirror', 'rug', 'field', 'armchair', 'seat', 'fence', 'desk', 'rock', 'wardrobe', 'lamp', 'bathtub', 'railing', 'cushion', 'base', 'box', 'column', 'signboard', 'dresser', 'counter', 'sand', 'sink', 'skyscraper', 'fireplace', 'refrigerator', 'grandstand', 'path', 'stairs', 'runway', 'case', 'pooltable', 'pillow', 'screen', 'stairway', 'river', 'bridge', 'bookcase', 'blind', 'coffeetable', 'toilet', 'flower', 'book', 'hill', 'bench', 'countertop', 'stove', 'palmtree', 'kitchen', 'computer', 'swivelchair', 'boat', 'bar', 'arcade', 'hut', 'bus', 'towel', 'light', 'truck', 'tower', 'chandelier', 'awning', 'streetlight', 'booth', 'television', 'airplane', 'dirttrack', 'apparel', 'pole', 'land', 'balustrade', 'escalator', 'ottoman', 'bottle', 'sideboard', 'poster', 'stage', 'van', 'ship', 'fountain', 'conveyerbelt', 'canopy', 'washer', 'toy', 'pool', 'stool', 'barrel', 'basket', 'waterfall', 'tent', 'bag', 'motorbike', 'cradle', 'oven', 'ball', 'food', 'step', 'tank', 'brandname', 'microwave', 'pot', 'animal', 'bicycle', 'lake', 'dishwasher', 'screen.1', 'blanket', 'sculpture', 'hood', 'sconce', 'vase', 'trafficlight', 'tray', 'trashcan', 'fan', 'pier', 'crtscreen', 'plate', 'monitor', 'bulletinboard', 'shower', 'radiator', 'glass', 'clock', 'flag']

const visualFeatures = ["road", "building", "sky", "sidewalk", "car", "tree", "person", "window", "door", "streetlight", "signboard", "pole", "fence"]//, "truck", "bus", "plant", "bench", "bicycle", "trafficlight", "tower", "van", "bridge", "path", "earth", "wall"]
const landuseFeatures = ["commercial", "residential", "mixeduse", "institutionalr", "industrial", "openspace"]

var panoImgs = {};
var featureSliders = {};

//check aspect ratio
var w = window.innerWidth;
var h = window.innerHeight;
asp_ratio = w / h;
if (asp_ratio < 1.2) {
  alert(
    "Please check your monitor aspect ratio. PLACEIFY is designed for desktops computers and will not work on mobile devices."
  );
}

//define HTML elements
const element = document.body;
scat_plot = document.getElementById("plot1");
text_1 = document.getElementById("sometext");

explComp = document.getElementById('explorercomponents');

//slider elements

commercial_slider = document.getElementById("commercial");
residential_slider = document.getElementById("residential");
mixeduse_slider = document.getElementById("mixeduse");
institutional_slider = document.getElementById("institutional");
industrial_slider = document.getElementById("industrial");
openspace_slider = document.getElementById("openspace");

income_p_slider = document.getElementById("income_p");
income_h_slider = document.getElementById("income_h");
popdensity_slider = document.getElementById("popdensity");
p_employed_slider = document.getElementById("p_employed");

density_slider = document.getElementById("density");

//access CSS variables
// Select the root element (or any other element with the CSS variable)
const root = document.documentElement;
const btnSldrColor = getComputedStyle(root).getPropertyValue('--buttonslider').trim();
const header2Color = getComputedStyle(root).getPropertyValue('--header_2').trim();
const header1Color = getComputedStyle(root).getPropertyValue('--header_1').trim();
const back2Color = getComputedStyle(root).getPropertyValue('--background_2').trim();
//define colors
var pointColor1 = btnSldrColor;
var pointColor1_highlight = header1Color;
var pointColor2 = header2Color;


var placeifyType = "image"; //set placeify type
var cities;
var city;

var markers;
var selected_markers;
var analogy_markers;
var map;

function map_init(){
    //leaflet map setup
    map = L.map("map").setView([40.78302982007834, -73.91840240387887], 10);
    var CartoDB_Positron = L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 20,
      }
    ).addTo(map);
    // show the scale bar on the lower left corner
    L.control.scale({ imperial: true, metric: true }).addTo(map);

    markers = L.layerGroup();
    selected_markers = L.layerGroup();
    analogy_markers = L.layerGroup();

    //set map onclick
    map.on("click", function (e) {
      if (user_locs.length < 3) {
        user_locs.push([e.latlng.lat, e.latlng.lng]);
        var circle = L.circle([e.latlng.lat, e.latlng.lng], {
          stroke: false,
          fillColor: pointColor2,
          fillOpacity: 1,
          radius: 150,
        });
        circle.addTo(analogy_markers);
        analogy_markers.addTo(map);
      } else {
        alert("Only pick upto 3 places! Right click on map to clear!");
      }
    });

    //set map on right click
    map.on("contextmenu", function () {
      analogy_markers.clearLayers();
      user_locs = [];
    });
}


(async function main() {
    [config] = await getConfig(); // Ensures this completes before proceeding
    await defineHTMLElements(); // Ensures this completes before proceeding
    map_init();
    loadDataAndRender();
    document.getElementById("user").value = user; //set user (hidden variable) in placeify images form
})();

async function defineHTMLElements() {
  //define html panoImgs
  for (i = 0; i<360; i= i+90){//0, 90, 180, 270
    panoImgs[i.toString()] = document.getElementById(`panoImg${i}`);
  }
  renderFeatureSliders(visualFeatures, containerId = "viz_features")
  renderFeatureSliders(landuseFeatures, containerId = "landuse_features")
  populateCitySelector();
};

async function loadDataAndRender() {
  //console.log("Starting main function...");
  if (scores_exist == "True"){
      [data, analogies] = await getScores(); // Ensures this completes before proceeding
      console.log(data);
      console.log(analogies);
      populateAnalogySelector();
      renderAll();
      updateViewSelector();
      placeifyType = analogies[0].analogytype;
      updateTypePanel(placeifyType);    //update placeify type panel
  }
  updateGSVHeight()  //update height of images
};

function renderAll(){
    renderSamples();  //render samples
    renderImageGrid(24); //render top images
    renderUserImgs(analogies); //update user img thumbnails
    renderPlot();  //render plot
}

async function renderPlot() {
  console.log("Rendering plot");
  Plotly.purge(scat_plot);
  const axis0 = document.getElementById("axisselector0").value;
  const axis1 = document.getElementById("axisselector1").value;
  const axis2 = document.getElementById("axisselector2").value;
  const repStyle = document.getElementById("operationselector").value;

  let sampleXValues;
  let sampleYValues;
  let sampleZValues;
  let analogyXValues;
  let analogyYValues;
  let analogyZValues;

  if (repStyle == "analogical") {
    sampleXValues = data.map((d) => d.s_0);
    sampleYValues = data.map((d) => d.s_1);
    sampleZValues = data.map((d) => d.s_2);
    analogyXValues = analogies.map((d) => d.s_0);
    analogyYValues = analogies.map((d) => d.s_1);
    analogyZValues = analogies.map((d) => d.s_2);
  }

  if (repStyle == "params") {
    const axisvalues = await getAxisValues(axis0, axis1, axis2);
    sampleXValues = Object.values(axisvalues[axis0]);
    sampleYValues = Object.values(axisvalues[axis1]);
    sampleZValues = Object.values(axisvalues[axis2]);
    analogyXValues = analogies.map(() => NaN);
    analogyYValues = analogies.map(() => NaN);
    analogyZValues = analogies.map(() => NaN);
  }

  const dataTrace = {
    x: sampleXValues,
    y: sampleYValues,
    z: sampleZValues,
    lat: data.map((d) => d.lat),
    lon: data.map((d) => d.lon),
    filename: data.map((d) => d.filename),
    mode: "markers",
    marker: {
      size: 0.5,
      color: pointColor1,
    },
    type: "scatter3d",
    name: "data",
  };

  const analogyTrace = {
    x: analogyXValues,
    y: analogyYValues,
    z: analogyZValues,
    filename: analogies.map((d) => d.filename),
    analogytype: analogies.map((d) => d.analogytype),
    mode: "markers",
    marker: {
      size: 7,
      color: pointColor2,
    },
    type: "scatter3d",
    name: "analogies",
  };

  plot_layout = {
    plot_bgcolor: back2Color,
    paper_bgcolor: back2Color,
    margin: { t: 0 },
  };

  const data_list = [dataTrace, analogyTrace];
  Plotly.newPlot(scat_plot, data_list, plot_layout);
  if (typeof scat_plot.removeAllListeners === "function") {
    scat_plot.removeAllListeners("plotly_click");
  }

  //on Plotly click
  scat_plot.on("plotly_click", function (plotData) {
    //console.log(data.points[0]);
    if (plotData.points[0].curveNumber == 0) {
      //if clicked on samples (data trace)
      for (var i = 0; i < plotData.points.length; i++) {
        thisFilename = plotData.points[i].data.filename[plotData.points[i].pointNumber];
        sampleSelected(thisFilename); //sample selected logic
      }
    } //close out data trace logic

    if (plotData.points[0].curveNumber == 1) {
      //if clicked on analogy (analogy trace)
      for (var i = 0; i < plotData.points.length; i++) {
        const pointNumber = plotData.points[i].pointNumber;
        const thisAnalogyType = plotData.points[i].data.analogytype[pointNumber];
        analogySelected(pointNumber, thisAnalogyType);
      }
    } //close out analogy trace logic
  });
}

function renderSamples() {

  const styleBy = document.getElementById("analogyselector").value;
  const styleScale = Number(document.getElementById("style_slider").value);

  const rep = data.map(d => d[`s_${styleBy}`]);
  const rep_normed = normalizeArray(rep);

  const avgLat = data.reduce((sum, d) => sum + d.lat, 0) / data.length;
  const avgLon = data.reduce((sum, d) => sum + d.lon, 0) / data.length;
  map.setView([avgLat, avgLon], 12);

  markers.clearLayers();
  console.log("Rendering samples based on ", `s_${styleBy}`);

  data.forEach((d, i) => {
    const intensity = Math.pow(rep_normed[i], styleScale);

    const circle = L.circle([d.lat, d.lon], {
      stroke: false,
      fillColor: pointColor1,
      fillOpacity: intensity,
      radius: 150 * intensity,
    });
    circle.index = i;
    circle.filename = d.filename;

    circle.on("click", function (e) {
      analogy_markers.clearLayers();
      sampleSelected(e.target.filename);
    });

    markers.addLayer(circle);
  });

  map.addLayer(markers);
}

//main placeify routes
function processImages() {
  showPopup();
  document.getElementById('form').submit();
}

function processLocs() {
  showPopup();
  var locJSON = JSON.stringify(this.user_locs);
  console.log(locJSON);
  window.location.href = "/processlocs?userlocs=" + locJSON + "&user=" + user;
}

function processParams() {
  showPopup();
  metric = document.getElementById("metricselector").value;
  var featureJSON = JSON.stringify(this.selected_features);
  console.log(featureJSON);
  window.location.href = `/processparams?selectedfeatures=${featureJSON}&user=${user}&metric=${metric}`;
}

function processText() {
  showPopup();
  var text = document.getElementById('place_descr').value;
  window.location.href =
    "/processtext?text=" + text + "&user=" + user;
}

//show loading screen while processing
function showPopup() {
  document.getElementById("loading_popup").style.display = "block";
  document.getElementById("map").style.display = "none";
  var intervalId = window.setInterval(function () {
    fetch(logFile)
      .then((res) => res.text())
      .then((text) => {
        console.log(text);
        // document.getElementById("log_text").innerHTML = text;
      })
      .catch((e) => console.error(e));
  }, 2000); //2000 = query log data every 2 secs
}

// update sliders
function updateSliders(sampleFeatures) {
  Object.keys(featureSliders).forEach(feature => {
    const slider = featureSliders[feature];
    if (feature in sampleFeatures) {
      slider.value = sampleFeatures[feature]*100;
    }
  });
}


//update gsv in panel
function updateGSV(sampleFeatures) {
    // Extract panoID and city to variables
    const filename = sampleFeatures["filename"];
    const city = sampleFeatures["city"];
    // console.log(panoID, heading)

    if (sampleFeatures.panoid){
      const panoID = sampleFeatures["panoid"];
      const heading = sampleFeatures["heading"];
      //update panoImg links
      for (i = 0; i<360; i= i+90){//0, 90, 180, 270
        panoImgs[i.toString()].src = `/getfile?filename=${panoID}_${i}.jpg&directory=${gsv_dir[city]}`;
        panoImgs[i.toString()].style.border = "none";
      } 
      panoImgs[heading].style.border = "3px solid red";
    }
    else {
      resetGSV();
      panoImgs['0'].src = `/getfile?filename=${filename}&directory=${gsv_dir[city]}`;
      panoImgs['0'].style.border = "3px solid red";
    }

}

function updateAnalogyGSV(filename) {
  panoImg0.src =
    "/getfile?filename=" +
    user +
    "_" +
    filename +
    "_0.jpg&directory=" +
    user_gsv_dir;
  panoImg90.src =
    "/getfile?filename=" +
    user +
    "_" +
    filename +
    "_90.jpg&directory=" +
    user_gsv_dir;
  panoImg180.src =
    "/getfile?filename=" +
    user +
    "_" +
    filename +
    "_180.jpg&directory=" +
    user_gsv_dir;
  panoImg270.src =
    "/getfile?filename=" +
    user +
    "_" +
    filename +
    "_270.jpg&directory=" +
    user_gsv_dir;
}

//update gsv in panel
function resetGSV() {
    //update panoImg links
    for (i = 0; i<360; i= i+90){//0, 90, 180, 270
      panoImgs[i.toString()].src = "/getfile?filename=img.jpg&directory=templates";
      panoImgs[i.toString()].style.border = "none";
    } 
}

//update gsv height in panel
function updateGSVHeight() {
  heightRatio = 0.85;
    for (i = 0; i<360; i= i+90){//0, 90, 180, 270
      panoImgs[i.toString()].style.height = explComp.offsetHeight*heightRatio+'px';
    } 
}

//update place info

function updateDetails(sampleFeatures) {
  var pts = "";
  //pts = 'panoId: '+features['panoID'][i]+'<br>';
  pts = pts + "City: " + sampleFeatures["city"];
  pts = pts + "<br>Coordinates: " + sampleFeatures["lat"].toString() + "," + sampleFeatures["lon"].toString();
  pts = pts + "<br>Filename: " + sampleFeatures["filename"];
  pts = pts + "<br>Explore in Google Maps: " + "<a href='https://www.google.com/maps?q=" + sampleFeatures["lat"] + "," + sampleFeatures["lon"] + "' target='_blank'>Open location</a>";
  // pts = pts + "<br>Address: "+ sampleFeatures["Address"];
  text_1.innerHTML = pts;
}

function sliderChanged(name, value) {
  value = parseFloat(value) / 100;
  selected_features[name] = value;
  console.log("Changed!", name, selected_features[name]);
  //console.log(selected_features);
}

function analogySelected(pointNumber, thisAnalogyType) {
  console.log("Analogy Selected",pointNumber, thisAnalogyType)
  const filename = analogies[pointNumber].filename;
  if (thisAnalogyType == "image") {
    console.log("this is an image analogy", filename);
    resetGSV();
    panoImg0.src = "/getfile?filename="+filename+"&directory="+user_img_dir;
  }
  if (thisAnalogyType == "location") {
    console.log("this is a location analogy", filename);
    resetGSV();
    updateAnalogyGSV(filename);
  }
  if (thisAnalogyType == "params") {
    console.log("this is a parameterised analogy");
  }
  document.getElementById("analogyselector").value = pointNumber;
  text_1.innerHTML = "Analogy: " + (pointNumber + 1).toString();
  renderAll();
}

async function sampleSelected(filename) {
  user_locs = [];
  console.log("Selected filename: ", filename);
  const dataSample = data.find(d => d.filename === filename)
  selected_markers.clearLayers();
  const selCircle = L.circle([dataSample.lat, dataSample.lon], {
    stroke: false,
    fillColor: pointColor1_highlight,
    fillOpacity: 0.5,
    radius: 150,
  });

  selected_markers.addLayer(selCircle);
  map.addLayer(selected_markers);
  map.setView([dataSample.lat, dataSample.lon], 15);
  try {
    const sampleFeatures = await getSampleFeatures(filename);  // Get features of selected sample (sample at selected index)
    // console.log(sampleFeatures);
    selected_features = sampleFeatures;
    //console.log(sampleFatures);
    updateGSV(sampleFeatures); // update gsv images
    updateSliders(sampleFeatures); //update sliders
    updateDetails(sampleFeatures); //update place details

  } catch (error) {
    console.error("Error getting selected features:", error);
  }
}

async function getSampleFeatures(filename) {
  try {
    const response = await fetch(`/getsamplefeatures?filename=${filename}&city=${city}&user=${user}`);  // Fetching data
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const sampledata = await response.json();  // This will resolve with the JSON data
    return sampledata;  // Return the data to be used in the calling function
  } catch (error) {
    console.error("Error fetching data:", error);
    throw error;  // Rethrow the error to be caught in sampleSelected
  }
}

async function getAxisValues(axis0, axis1, axis2) {
  try {
    const response = await fetch(`/getaxisvalues?axis0=${axis0}&axis1=${axis1}&axis2=${axis2}&user=${user}`);  // Fetching data
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const axisvalues = await response.json();  // This will resolve with the JSON data
    return axisvalues;  // Return the data to be used in the calling function
  } catch (error) {
    console.error("Error fetching data:", error);
    throw error;  // Rethrow the error to be caught in sampleSelected
  }
}

//show plot or map in view 2

function setView2() {
  view2 = document.getElementById("view2selector").value;
  if (view2 == "map") {
    document.getElementById("map_div_2").style.display = "block";
    document.getElementById("plot_div").style.display = "none";
  }
  if (view2 == "plot") {
    document.getElementById("map_div_2").style.display = "none";
    document.getElementById("plot_div").style.display = "block";
  }
}

//normalise an array between 0 and 1
//need to figure out why array is lopading into func as NaN
function normalizeArray(arr) {
  if (arr.length === 0) {
    return arr; // Return the input array if it's empty
  }
  // Find the minimum and maximum values in the array
  const minValue = Math.min(...arr);
  const maxValue = Math.max(...arr);
  // Normalize the array values to the range [0, 1]
  const normalizedArray = arr.map(
    (value) => (value - minValue) / (maxValue - minValue)
  );
  return normalizedArray;
}

function getQueryParam(paramName) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(paramName);
}

function togglePlot() {
  var plotDiv = document.getElementById("plot_div");
  var mapDiv1 = document.getElementById("map_div_1");

  if (plotDiv.style.display === "none") {
    plotDiv.style.display = "block";
    mapDiv1.style.width = "50%";
  } else {
    plotDiv.style.display = "none";
    mapDiv1.style.width = "100%";
  }
}

// new function for three-way dropdown
function switchView() {
  const selector = document.getElementById("view_selector").value;
  const mapDiv = document.getElementById("map_div_1");
  const plotDiv = document.getElementById("plot_div");
  const imageDiv = document.getElementById("image_div");

  plotDiv.style.display = "none";
  imageDiv.style.display = "none";
  mapDiv.style.width = "100%";

  if (selector === "map_plot") {
    mapDiv.style.width = "50%";
    plotDiv.style.display = "block";
  } 
  else if (selector === "map_images") {
    mapDiv.style.width = "50%";
    imageDiv.style.display = "flex";
  }
  requestAnimationFrame(() => {
      map.invalidateSize();
  });
}


function renderUserImgs(analogies) {
  if (analogies[0].analogytype === 'image') {
    analogies.forEach((d, i) => {
      const userImg = document.getElementById(`userImg${i}`);
      userImg.src = `/getfile?filename=${d.filename}&directory=${user_img_dir}`;
      userImg.onclick = () => {
        analogySelected(i, d.analogytype);
      };
    });
  }
}

function setPlaceifyType(type){
  placeifyType = type;
  updateTypePanel(placeifyType);
}

function triggerPlaceify(){
  if (placeifyType=='image'){
    processImages();
  }
  if (placeifyType=='location'){
    processLocs();
  }
  if (placeifyType=='params'){
    processParams();
  }
  if (placeifyType=='text'){
    processText();
  }
}

function updateTypePanel(type){
  img_btn = document.getElementById("img_btn");
  loc_btn = document.getElementById("loc_btn");
  prm_btn = document.getElementById("prm_btn");
  txt_btn = document.getElementById("txt_btn");
  imgcontrols = document.getElementById("imgcontrols");
  locationcontrols = document.getElementById("locationcontrols");
  paramcontrols = document.getElementById("paramcontrols");
  if (type=='image'){
    img_btn.style.backgroundColor = header2Color;
    loc_btn.style.backgroundColor = btnSldrColor;
    prm_btn.style.backgroundColor = btnSldrColor;
    txt_btn.style.backgroundColor = btnSldrColor;
    imgcontrols.style.display = "block";
    locationcontrols.style.display = "none";
    paramcontrols.style.display = "none";
    textcontrols.style.display = "none";
  }
  if (type=='location'){
    img_btn.style.backgroundColor = btnSldrColor;
    loc_btn.style.backgroundColor = header2Color;
    prm_btn.style.backgroundColor = btnSldrColor;
    txt_btn.style.backgroundColor = btnSldrColor;
    imgcontrols.style.display = "none";
    locationcontrols.style.display = "block";
    paramcontrols.style.display = "none";
    textcontrols.style.display = "none";
  }
  if (type=='params'){
    img_btn.style.backgroundColor = btnSldrColor;
    loc_btn.style.backgroundColor = btnSldrColor;
    prm_btn.style.backgroundColor = header2Color;
    txt_btn.style.backgroundColor = btnSldrColor;
    imgcontrols.style.display = "none";
    locationcontrols.style.display = "none";
    paramcontrols.style.display = "block";
    textcontrols.style.display = "none";
  }
  if (type=='text'){
    img_btn.style.backgroundColor = btnSldrColor;
    loc_btn.style.backgroundColor = btnSldrColor;
    prm_btn.style.backgroundColor = btnSldrColor;
    txt_btn.style.backgroundColor = header2Color;
    imgcontrols.style.display = "none";
    locationcontrols.style.display = "none";
    paramcontrols.style.display = "none";
    textcontrols.style.display = "block";
    document.getElementById("place_descr").value = analogies[0].filename
  }
}

async function getScores() {
  try {
    city = document.getElementById("cityselector").value
    // Fetch all files in parallel
    const [repResponse, analogyResponse] = await Promise.all([
      fetch(`/getfile?filename=${city}_scores.json&directory=${scores_dir}`),
      fetch(`/getfile?filename=${city}_analogy_scores.json&directory=${scores_dir}`)
    ]);
    // Convert responses to JSON
    const [data, analogies] = await Promise.all([
      repResponse.json(),
      analogyResponse.json()
    ]);
    // Now all data is available
    //console.log(data);
    //console.log(analogies);
    return [data, analogies]

  } catch (error) {
    console.error("Error fetching data:", error);
  }
}

async function getConfig() {
  try {
    // Fetch all files in parallel
    const [configResponse] = await Promise.all([
      fetch(configFile)
    ]);
    // Convert responses to JSON
    const [config] = await Promise.all([ 
      configResponse.json(),
    ]);
      gsv_dir = config["gsv_dir"]
      cities = Object.keys(gsv_dir)
      console.log("city:",city)
    return [config]
  } catch (error) {
    console.error("Error fetching data:", error);
  }
}

function renderFeatureSliders(features, containerId = "viz_features") {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  features.forEach(feature => {
    const block = document.createElement("div");
    block.classList.add("featureblock");

    const label = document.createElement("label");
    label.classList.add("featurelabel");
    label.setAttribute("for", feature);
    label.textContent = `${feature}:`;

    const input = document.createElement("input");
    input.type = "range";
    input.name = feature;
    input.min = 0;
    input.max = 100;
    input.value = 0;
    input.classList.add("slider");
    input.id = `${feature}_slider`;
    input.addEventListener("change", function () {
      sliderChanged(this.name, this.value);
    });
    featureSliders[feature] = input
    block.appendChild(label);
    block.appendChild(input);
    container.appendChild(block);
  });
}

function populateCitySelector(){
  const cityselector = document.getElementById("cityselector");
  cities.forEach(city => {
    const option = document.createElement("option");
    option.value = city;
    // optional: nicer label (capitalize)
    option.textContent = (city.charAt(0).toUpperCase() + city.slice(1)).slice(0,13);
    cityselector.appendChild(option);
  });
}

function populateAnalogySelector(){
  console.log(analogies.length)
  const analogyselector = document.getElementById("analogyselector");
  for (i = 0; i<analogies.length; i++) {
    const option = document.createElement("option");
    option.value = i;
    option.textContent = `Analogy ${i+1}`
    analogyselector.appendChild(option);
  };
}

function updateViewSelector(){
     if (analogies.length > 2){
      document.getElementById("view_selector").value = "map_plot";
      switchView();
     }
    else {
      document.getElementById("view_selector").value = "map_images";
      switchView();
     }
}



//Theme functions NOT YET WORKING
// Function to get CSS variable values from the applied class
function getThemeColors() {
  const styles = getComputedStyle(element);
  return {
      btnSldrColor: styles.getPropertyValue('--buttonslider').trim(),
      header1Color: styles.getPropertyValue('--header_1').trim(),
      header2Color: styles.getPropertyValue('--header_2').trim(),
      back2Color: styles.getPropertyValue('--background_2').trim()
  };
}

function applyTheme(themeName) {
    document.body.className = themeName; // Replace existing class with new theme

    setTimeout(() => {
        const colors = getThemeColors();
        console.log("Updated Theme Colors:", colors);
        pointColor1 = btnSldrColor;
        pointColor1_highlight = header1Color;
        pointColor2 = header2Color;
        renderPlot();
    }, 10);
}


// new render function for top n images

function renderImageGrid(n) {
  const styleBy = document.getElementById("analogyselector").value;
  const container = document.getElementById("top_images");
  container.innerHTML = "";

  const topK = [...data]
    .sort((a, b) => b[`s_${styleBy}`] - a[`s_${styleBy}`])
    .slice(0, n);

    // console.log(topK)
    
    topK.forEach(d => {
      const cell = document.createElement("div");
      cell.classList.add("top_image");

      const topimg = document.createElement("img");
      topimg.classList.add("top_image_img");
      topimg.src = `/getfile?filename=${d.filename}&directory=${gsv_dir[city]}`;
      topimg.dataset.filename = d.filename;

      topimg.addEventListener("click", function (e) {
        const filename = e.target.dataset.filename;
        sampleSelected(filename);   // call your function
      });

      cell.appendChild(topimg);
      container.appendChild(cell);
    });
}

