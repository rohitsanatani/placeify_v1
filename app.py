#skeletal imports
from flask import Flask, request, render_template, send_from_directory, jsonify
from fileinput import filename
import os, os.path
from dotenv import load_dotenv

#basic imports
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import cv2
import json
import requests
from PIL import Image
from io import BytesIO
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.metrics.pairwise import cosine_distances
import shutil

#Mask2Former imports
import glob
import torch
from transformers import AutoImageProcessor, Mask2FormerForUniversalSegmentation
#ResNet50 imports
import torchvision.transforms as transforms
from torchvision import models
#### SAM2 Imports #####
from transformers import Sam2Processor, Sam2Model
### Siglip imports###
from transformers import AutoModel, AutoProcessor

data_root = "data"

########## MODEL INIT FUNCTIONS ########################

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print("device: %s" % device)
optimize = True

def init_mask2former():
    processor_mask2former = AutoImageProcessor.from_pretrained("facebook/mask2former-swin-large-ade-semantic")
    model_mask2former = Mask2FormerForUniversalSegmentation.from_pretrained("facebook/mask2former-swin-large-ade-semantic").to(device).eval()
    print('Model initialised')
    return model_mask2former, processor_mask2former

def init_sam2():
    model_sam_id = "facebook/sam2.1-hiera-large"
    processor_sam = Sam2Processor.from_pretrained(model_sam_id)
    model_sam = Sam2Model.from_pretrained(model_sam_id).to(device).eval()
    return model_sam, processor_sam

def init_siglip():
    model_siglip_id = "google/siglip2-base-patch16-224"
    model_siglip = AutoModel.from_pretrained(model_siglip_id, dtype=torch.float32).to(device)
    processor_siglip = AutoProcessor.from_pretrained(model_siglip_id,dtype=torch.float32)
    return model_siglip, processor_siglip

##### Init Models ##############

model_mask2former, processor_mask2former = init_mask2former()
model_sam, processor_sam = init_sam2()
model_siglip, processor_siglip = init_siglip()
######### Flask setup

URBAN_DIR = f'{data_root}/urbandata/'
USER_DIR = f'{data_root}/userdata/'

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)

ade20k_labels = ['wall', 'building', 'sky', 'floor', 'tree', 'ceiling', 'road', 'bed', 'window', 'grass', 'cabinet', 'sidewalk', 'person', 'earth', 'door', 'table', 'mountain', 'plant', 'curtain', 'chair', 'car', 'water', 'painting', 'sofa', 'shelf', 'house', 'sea', 'mirror', 'rug', 'field', 'armchair', 'seat', 'fence', 'desk', 'rock', 'wardrobe', 'lamp', 'bathtub', 'railing', 'cushion', 'base', 'box', 'column', 'signboard', 'dresser', 'counter', 'sand', 'sink', 'skyscraper', 'fireplace', 'refrigerator', 'grandstand', 'path', 'stairs', 'runway', 'case', 'pooltable', 'pillow', 'screen', 'stairway', 'river', 'bridge', 'bookcase', 'blind', 'coffeetable', 'toilet', 'flower', 'book', 'hill', 'bench', 'countertop', 'stove', 'palmtree', 'kitchen', 'computer', 'swivelchair', 'boat', 'bar', 'arcade', 'hut', 'bus', 'towel', 'light', 'truck', 'tower', 'chandelier', 'awning', 'streetlight', 'booth', 'television', 'airplane', 'dirttrack', 'apparel', 'pole', 'land', 'balustrade', 'escalator', 'ottoman', 'bottle', 'sideboard', 'poster', 'stage', 'van', 'ship', 'fountain', 'conveyerbelt', 'canopy', 'washer', 'toy', 'pool', 'stool', 'barrel', 'basket', 'waterfall', 'tent', 'bag', 'motorbike', 'cradle', 'oven', 'ball', 'food', 'step', 'tank', 'brandname', 'microwave', 'pot', 'animal', 'bicycle', 'lake', 'dishwasher', 'screen.1', 'blanket', 'sculpture', 'hood', 'sconce', 'vase', 'trafficlight', 'tray', 'trashcan', 'fan', 'pier', 'crtscreen', 'plate', 'monitor', 'bulletinboard', 'shower', 'radiator', 'glass', 'clock', 'flag']

# setup users 
def getConfig():
    with open(f"{data_root}/config.json") as f:
        cfg = json.load(f)
    return cfg

cfg = getConfig() #get config data from json
cities = list(cfg["gsv_dir"].keys())
users = cfg["users"]
# print(cities)

######import location data and GSV embeddings##################

city_data = {}
for city in cities:
    city_df = pd.read_csv(os.path.join(URBAN_DIR, city, f"{city}_locs.csv"))
    viz_feats = np.load(os.path.join(URBAN_DIR,city,f"mask2former_{city}.npy"))
    ade20k_cols = pd.DataFrame(np.round(viz_feats, 3),columns=ade20k_labels,index=city_df.index)
    city_df = pd.concat([city_df, ade20k_cols], axis=1)
    city_df[ade20k_labels] = np.round(viz_feats, 3)
    city_data[city] = city_df

########Flask routes####################

@app.route('/')
def hello():
    global users
    users = getConfig()["users"]
    print("users",users)
    print("cities",cities)
    return render_template("intro.html")

@app.route('/about')
def about():
    return render_template("about.html")

@app.route('/main')
def main():
    user = request.args.get('user') #get user
    print("Current subject:",user)
    scores_exist = 'False'
    #render template based on user
    if user in users:
        os.makedirs(os.path.join(USER_DIR,user,"images"), exist_ok=True)
        os.makedirs(os.path.join(USER_DIR,user,"scores"), exist_ok=True)
        if (os.path.isfile(os.path.join(USER_DIR,user,"scores",f"{cities[0]}_scores.json")) == True):
            print('Similarity scores exist')
            scores_exist = "True"
        return render_template("main.html", user = user, scores_exist = scores_exist)
    else:
        return render_template("denied.html")


@app.route('/processimgs', methods = ['POST'])  
def process():
    print('In process Image route!')
    print(request.method)
    if request.method == 'POST':
        user = request.form['user']
        model = request.form['model']
        metric = request.form.get('metric','cosine')
        log_text = ""
        write_logs(log_text, user) #log
        #save user files in upload folder
        files = request.files.getlist("file")  
        # Iterate for each file in the files List, and Save them
        filenames = []
        for file_index, file in enumerate(files):
            file.save(os.path.join(USER_DIR,user,"images",file.filename))
            filenames.append(file.filename)
        print(filenames)

        #generate image embeddings for uploaded images
        gsv_embs = []
        user_embs = []
        for i, filename in enumerate(filenames):
            print("Extracting features: ",filename)
            log_text += "<br>\nAnalyzing features: Image "+str(i+1) #log
            write_logs(log_text, user)    #log
            filepath = os.path.join(USER_DIR,user,"images",filename)
            img = Image.open(filepath).convert("RGB")
            global_vec = get_image_features(img,model)
            print(global_vec.shape)
            user_embs.append(global_vec)
        user_embs = np.stack(user_embs, axis=0)  # (n_images, d)
        print(user_embs.shape)

        #get analogical reps for database samples as well as analogies
        analogical_reps = []
        analogy_analogical_reps = []
        for city in cities:
            gsv_embs_city = np.load(os.path.join(URBAN_DIR,city,f"{model}_{city}.npy"))
            analogical_reps_city = compute_scores(gsv_embs_city,user_embs,metric) #for gsv database samples
            analogical_reps.append(analogical_reps_city)
            analogy_analogical_reps_city = compute_scores(user_embs,user_embs,metric) #for analogies
            analogy_analogical_reps.append(analogy_analogical_reps_city)

        get_score_jsons(city_data, analogical_reps, analogy_analogical_reps, filenames, 'image', user) #export reps as json files

        #render template based on user
        if user in users:
            return render_template("main.html", user=user, scores_exist = 'True')
        else:
            return render_template("denied.html")
        
@app.route('/processtext')
def processtext():
    user = request.args.get('user') #get user
    metric = request.args.get('metric','cosine')
    text = request.args.get('text') #get text
    print("The query text is",text)

    log_text = "Processing text query"
    write_logs(log_text, user)    #log

    user_embs = []

    global_vec = embed_text(text)
    print(global_vec.shape)
    user_embs.append(global_vec.detach().cpu().numpy())
    user_embs = np.stack(user_embs, axis=0)  # (n_images, d)
    print(user_embs.shape)

    analogical_reps = []
    analogy_analogical_reps = []
    for city in cities:
        gsv_embs_city = np.load(os.path.join(URBAN_DIR,city,f"siglip_{city}.npy"))
        analogical_reps_city = compute_scores(gsv_embs_city,user_embs,metric) #for gsv database samples
        analogical_reps.append(analogical_reps_city)
        analogy_analogical_reps_city = compute_scores(user_embs,user_embs,metric) #for analogies
        analogy_analogical_reps.append(analogy_analogical_reps_city)
    
    filenames = [text]

    get_score_jsons(city_data, analogical_reps, analogy_analogical_reps, filenames, 'text', user) #export reps as json files

    #render template based on user
    if user in users:
        return render_template("main.html", user=user, scores_exist = 'True')
    else:
        return render_template("denied.html")
    
@app.route('/processparams')
def processparams():
    user = request.args.get('user') #get user
    metric = request.args.get('metric','euclidean')
    log_text = ""
    write_logs(log_text, user)    #log
    selectedfeatures = json.loads(request.args.get('selectedfeatures'))
    selected_df = pd.DataFrame(selectedfeatures, index = [0])
    #print(selected_df.head())
    user_features = np.array(selected_df[ade20k_labels])
    print("User features",user_features.shape)

    #get analogical reps for database samples as well as analogies
    analogical_reps = []
    analogy_analogical_reps = []
    for city in cities:
        gsv_embs_city = np.load(os.path.join(URBAN_DIR,city,f"mask2former_{city}.npy"))
        analogical_reps_city = compute_scores(gsv_embs_city,user_features,metric) #for gsv database samples
        analogical_reps.append(analogical_reps_city)
        analogy_analogical_reps_city = compute_scores(user_features,user_features,metric) #for analogies
        analogy_analogical_reps.append(analogy_analogical_reps_city)
    
    filenames = ["Feature description"]
    get_score_jsons(city_data, analogical_reps, analogy_analogical_reps, filenames, 'params', user) #export reps as json files

    #render template based on user
    if user in users:
        return render_template("main.html", user=user, scores_exist = 'True')
    else:
        return render_template("denied.html")
    
@app.route('/processlocs')
def processlocs():
    user = request.args.get('user') #get user
    metric = request.args.get('metric','euclidean')
    log_text = ""
    write_logs(log_text, user)    #log
    userlocs = json.loads(request.args.get('userlocs'))
    analogy_features = np.zeros((len(userlocs),150)) #initialise empty array of DPT features for all locations
    #save 4 images for each user loc, run DPT for each image, aggregate by location and populate analogy features
    headings = [0,90,180,270]
    filenames = []
    gsv_data, gsv_features = gsv_data_dpt, gsv_features_dpt
    for index, location in enumerate(userlocs): #for each location
        print("Processing location: ",location)
        filenames.append(index)
        heading_features = np.zeros((len(headings),150)) #initialise empty array of DPT fetaures for a given location 
        for h_index, heading in enumerate(headings): # for each heading (NESW)
            print("Processing heading: ",heading)
            gsv_img = GSV_single(location, heading, apiKey) #download GSV for location and heading 
            filepath = f'{processed_path}usergsv/{user}_{str(index)}_{str(heading)}.jpg'
            log_text += f"<br>\nDownloading GSV: {str(index)}_{str(heading)}.jpg"#log 
            write_logs(log_text, user) #log
            gsv_img.save(filepath) #save image for location and heading
            print("Extracting features: ",filepath)
            log_text += f"<br>\nAnalyzing features: {str(index)}_{str(heading)}.jpg" #log
            write_logs(log_text, user) #log
            prediction = get_DPT_features(filepath) # get DPT features
            #populate location features 
            for j in range(1,151):
                score = prediction[prediction == j].size/prediction.size
                heading_features[h_index][j-1] = score
        
        analogy_features[index] = heading_features.mean(axis=0) #populate analogy features for this location with mean of heading features

    #get analogical reps for database samples as well as analogies
    analogical_reps = get_analogical_reps(gsv_features,analogy_features,metric) #for gsv database samples
    analogy_analogical_reps = get_analogical_reps(analogy_features,analogy_features,metric) #for analogies
    #analogical_reps, analogy_analogical_reps = normalise_reps(analogical_reps, analogy_analogical_reps) #normalise reps together 
    best_headings = None
    get_analogical_jsons(gsv_data, analogical_reps, analogy_analogical_reps, filenames, best_headings, 'location', user) #export reps as jsons
    
    #render template based on user
    if user in users:
        return render_template("main.html", user=user)
    else:
        return render_template("denied.html")    

@app.route('/getfile')
def getfile(): 
    filename = request.args.get('filename')
    directory = request.args.get('directory')
    return send_from_directory(directory=directory, path=filename, as_attachment=True)

## LOAD FEATRES BY Filename.
@app.route('/getsamplefeatures')
def getfeatures():
    filename = request.args.get('filename',None)
    city = request.args.get('city',None)
    user = request.args.get('user')
    city_df = city_data[city]
    sample_features = city_df[city_df['filename']==filename].iloc[0].to_dict()
    if 'panoid' in sample_features.keys():
        name, ext = filename.rsplit(".", 1)
        panoid, heading = name.rsplit("_", 1)
        # print(filename, city, panoid, heading)
        sample_features.update({"heading":heading, "city":city})
    else:
        sample_features.update({"city":city})
    if user in users:
        return jsonify(sample_features)
    else:
        return render_template("denied.html")

@app.route('/getaxisvalues')
def getparamvalues(): 
    axis0 = request.args.get('axis0')
    axis1 = request.args.get('axis1')
    axis2 = request.args.get('axis2')
    user = request.args.get('user')
    axis_values = data_normed[[axis0,axis1,axis2]].to_dict()
    if user in users:
        return jsonify(axis_values)
    else:
        return render_template("denied.html")

############# Non-Flask functions here ##############

#Get GSV image from lat lon and other params
def GSV_single(location, heading, apiKey, pitch=0, fov=90, width=600, height=400):
  loc_string = str(location[0])+','+str(location[1])
  # format the request url for downloading image
  request_url = "https://maps.googleapis.com/maps/api/streetview?size={}x{}&location={}&heading={}&fov={}&pitch={}&key={}".format(width, height, loc_string, heading, fov, pitch, apiKey)
  print("Downloading image", request_url)
  # request image and return
  try:
      response = requests.get(request_url)
      return Image.open(BytesIO(response.content))
  except:
      return None
  
def get_image_features(img, model):
    print("Getting image features",model)
    resolution = -1
    if model == 'sam':
        patches, global_vec = get_SAM2_features(img, processor_sam, model_sam, device, resolution)
    if model == 'siglip':
        global_vec = get_siglip_features(img, processor_siglip, model_siglip, device)
    if model == 'mask2former':
        global_vec = get_ade20k_features(img, processor_mask2former, model_mask2former, device)
    return global_vec

  
##Mask2Former ADE20k features

@torch.no_grad()
def get_ade20k_features(image: Image.Image, processor, model, device):
    inputs = processor(images=image, return_tensors="pt")
    pixel_values = inputs["pixel_values"].to(device)
    outputs = model(pixel_values)
    seg = processor.post_process_semantic_segmentation(
        outputs,
        target_sizes=[image.size[::-1]]
    )[0].cpu().numpy()
    global_vec = np.bincount(seg.ravel(), minlength=len(ade20k_labels)) / seg.size
    return global_vec

#get SAM2 features

@torch.no_grad()
def sam2_feats(image: Image.Image, processor, model, device, resolution):
    """Return (fmap, processed_size) for an image."""
    inputs = processor(images=image, return_tensors="pt").to(device)
    out = model(**inputs)
    fmap = out.image_embeddings[resolution]  # (1,C,Hf,Wf)
    H_res, W_res = inputs["pixel_values"].shape[-2:]
    return fmap, (H_res, W_res)

@torch.no_grad()
def global_vec_from_fmap(fmap):
    """Compute global vector by GAP on the fmap."""
    gap = fmap.mean(dim=(-2, -1))  # (1,C)
    return torch.nn.functional.normalize(gap, dim=-1).squeeze(0)  # (C,)

@torch.no_grad()
def patches_from_fmap(fmap):
    patches = fmap.flatten(2).transpose(1, 2).squeeze(0)  # (P, C)
    return torch.nn.functional.normalize(patches, dim=1)

@torch.no_grad()
def get_SAM2_features(image: Image.Image, processor, model, device, resolution):
    """
    Returns:
        patches: (P, C) L2-normalized patch embeddings (P = Hf*Wf)
        fmap_hw: (Hf, Wf) spatial grid size for potential back-mapping
    """
    fmap, _ = sam2_feats(image, processor, model, device, resolution)
    patches = patches_from_fmap(fmap)
    global_vec = global_vec_from_fmap(fmap)
    return patches, global_vec.detach().cpu().numpy()

###Siglip features

@torch.no_grad()
def get_siglip_features(image: Image.Image, processor, model, device):
    inputs = processor(images=image, return_tensors="pt", padding=True).to(device)
    with torch.no_grad():
        emb = model.get_image_features(**inputs)
        # Normalize for cosine similarity
        emb = torch.nn.functional.normalize(emb, dim=-1).detach().cpu().numpy()
    return emb.squeeze()

def embed_text(query_text):
    text_inputs = processor_siglip(text=[query_text], return_tensors="pt", padding="max_length").to(device)
    with torch.no_grad():
        text_embedding = model_siglip.get_text_features(**text_inputs)
        text_embedding = torch.nn.functional.normalize(text_embedding, dim=-1)
    return text_embedding.squeeze()


#Analogical Reps Function

def compute_scores(gsv_embs_city, user_embs, metric):
    # print('In analogy func')
    # print(metric)
    analogical_reps_city = np.zeros((len(gsv_embs_city),3)) #if analogies are less than 3, those dimensions remain 0
    # print('gsv embs', gsv_embs_city.shape)
    # print('user embs', user_embs.shape)
    # print('analogical reps', analogical_reps_city.shape)

    if metric == 'cosine':
        # Compute cosine similarity matrix: shape (n_samples, num_analogies)
        similarity = cosine_similarity(gsv_embs_city, user_embs)
        print("similarity",similarity.shape)
        analogical_reps_city[:,:similarity.shape[1]] = similarity

    if metric == 'euclidean':
        for i in range(len(gsv_embs_city)):
            for j in range(len(user_embs)):
                temp = gsv_embs_city[i] - user_embs[j]
                sum_sq = np.dot(temp.T, temp)
                d = np.sqrt(sum_sq)
                analogical_reps_city[i][j] = 1/(1+d)
    return analogical_reps_city

#normalise analogical reps for samples and analogies between 0 and 1
def normalise_reps(analogical_reps, analogy_analogical_reps):
    combined_reps = np.concatenate((analogical_reps,analogy_analogical_reps),axis = 0) #combine samples and analogies
    combined_reps = (combined_reps - combined_reps.min())/(combined_reps.max()-combined_reps.min()) #normalise combined array
    analogical_reps = combined_reps[:-3] #seperate samples
    analogy_analogical_reps = combined_reps[-3:] #seperate analogies
    return analogical_reps, analogy_analogical_reps

#get/save analogical jsons based on analogical reps and analogy_analogical_reps
def get_score_jsons(city_data, analogical_reps, analogy_analogical_reps, filenames, analogytype, user):
    for city_index, city in enumerate(cities):
        analogical_df = pd.DataFrame(analogical_reps[city_index])
        analogical_df.columns = [f"s_{i}" for i in range(len(analogical_df.columns))]
        analogy_analogical_df = pd.DataFrame(analogy_analogical_reps[city_index])
        analogy_analogical_df.columns = [f"s_{i}" for i in range(len(analogy_analogical_df.columns))]
        analogy_analogical_df['filename'] = None #if filnames are less than 3, then the others remain None
        analogy_analogical_df['analogytype'] = None
        for i, filename in enumerate(filenames): 
            analogy_analogical_df.loc[i, 'filename'] = filename
            analogy_analogical_df.loc[i, 'analogytype'] = analogytype
        if 'panoid' in city_data[city].columns: #check if panoids exist
            analogical_df = pd.concat([city_data[city][['panoid','filename','lat','lon']],analogical_df],axis = 1) #concat lat lon and panoid
        else:
            analogical_df = pd.concat([city_data[city][['filename','lat','lon']],analogical_df],axis = 1) #concat lat lon and panoid
        print("columns",analogical_df.columns)
        analogical_df = analogical_df
        analogy_analogical_df = analogy_analogical_df
        # analogical_df = analogical_df.sort_values(by = 0, ascending = False) #sort for topk in frontend
        analogical_df.to_json(os.path.join(USER_DIR,user,"scores",f'{city}_scores.json'), orient="records")#write sample json
        analogy_analogical_df.to_json(os.path.join(USER_DIR,user,"scores",f'{city}_analogy_scores.json'), orient="records")#write analogy json

#write logs
def write_logs(log_text, user):
    with open(os.path.join(USER_DIR,user,"log.txt"), "w") as text_file:
        text_file.write(log_text)
