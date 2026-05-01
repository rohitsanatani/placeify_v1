# PLACEIFY

PLACEIFY is a data-driven web application for similarity-based place-referencing in urban design and planning. It enables users to define urban scenarios using images, text, feature values, or real-world locations, and retrieves visually similar places from large-scale street-level image datasets.

![Description](samples/sketch_based.jpg)

## Setup

1. Clone the repository:

```bash
git clone https://github.com/rohitsanatani/placeify_v1.git
cd placeify_v1
```

2. Create and activate a conda environment:

```bash
conda create -n placeify python=3.10
conda activate placeify
```

3. Install dependencies:

```bash
pip install -r requirements.txt
```
Please note: PLACEIFY uses SigLIP which is sensitive to specific versions of transformers.

4. Load sample data:

In data/urbandata, download and save sample datasets found here: https://drive.google.com/drive/folders/1nZxMUQ5WmzKTL9vlFrOgjXu0hUcH1s98?usp=sharing
Also download sample images for each dataset. 

5. Setup config file

Update paths to data images in config_sample.json. Also update list of users and Google Street View API key (optional). Rename file to config.json

6. Run the application!

```bash
flask run
```

The app will be available at:

```text
http://localhost:5000/
```

## Key Functionalities

- **Image-Based Search:** Upload up to three images or sketches to retrieve visually similar locations using learned image embeddings.
- **Text-Based Search:** Enter natural language descriptions, such as “tree-lined residential street,” and retrieve matching locations using a vision-language model.
- **Feature-Based Exploration:** Adjust urban features, such as greenery and buildings, via sliders to construct hypothetical scenarios and find similar places.
- **Location-Based Queries:** Select real-world coordinates to generate embeddings from street-view imagery and retrieve similar locations.
- **Similarity-Space Visualization:** Explore results in an interactive 3D similarity space, where each axis represents similarity to a user-defined scenario.

## Requirements

- Python via Conda environment
- About 8GB RAM and 8GB VRAM recommended for smooth performance
- Modern web browser, such as Chrome, Edge, or Firefox