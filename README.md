# TikTok Tides

Website: https://hellokathylee.github.io/tiktok-tides/

Video demo: https://drive.google.com/file/d/1SCme7MNmKFqVYn1CJp81brFOhyTWbvVJ/view?usp=drive_link

## Overview

<img src="public/assets/Alien_Wave.png" alt="Alien waving" width="200" align="right" style="margin-left: 20px; margin-bottom: 10px;" />

**TikTok Tides** is a project by **Team TrendTokers** that follows the journey of a curious alien visitor trying to understand one of Earth’s most powerful cultural forces: TikTok trends. To help our extraterrestrial friend figure out what makes humans like, comment, and vibe with certain videos, we collect and analyze TikTok data to map out how trends rise, peak, and fade.

Through interactive visualizations, TikTok Tides uncovers what drives virality. By exploring these trend “waves,” our alien analyst (and you!) can learn how different types of content spark engagement and why some trends conquer the algorithm while others disappear into the cosmic void.

### Key Goals

- **Understand what drives TikTok virality** by analyzing factors like audio popularity, content category, and video duration
- **Measure how trends shape and sustain engagement** through views, likes, comments, and interactions across different types of content
- **Explore how language and emotion** in captions and comments relate to a trend’s growth, community response, and overall popularity

## Project Structure (High-Level)
```
tiktok-tides/
│
├─ public/
│   ├─ assets/            # Static assets (images, icons, story art)
│   ├─ data/              # Processed TikTok datasets (JSON)
├─ src/
│   ├─ css/                # Global and scene-specific stylesheets
│   ├─ js/                 # Scroll logic, scene controllers, interactive behavior
│   ├─ illustrations/      # Scene graphics
│   └─ vizzes/             # All D3.js visualization scripts (planet viz, record player, etc.)
├─ index.html
├─ package.json
└─ vite.config.js
```
## Scene-by-Scene Interaction Guide
<img src="public/assets/UFO_Animated.gif" alt="Alien waving" width="200" align="right" style="margin-left: 20px; margin-bottom: 10px;" />

### 👽 Scene 1 — Arrival
Introduces the alien narrator and sets up the central question: What makes a TikTok video go viral?
Acts as the starting point for the scrollytelling journey.

### 🪐 Scene 2 — Music Galaxy
A solar-system–style visualization showing which artists had viral TikTok audio across different years.
Highlights how audio energy, danceability, and repeat appearances contribute to virality.

### 💿 Scene 3 — Viral Sounds
A record-player visualization that showcases the top viral tracks on TikTok.
Illustrates how certain songs gain massive reach through repeated use across videos.

### ⏱️ Scene 4 — Timing
A radial stopwatch chart exploring how video duration affects performance.
Shows “sweet spot” timing ranges where videos tend to get more plays.

### 🔺 Scene 5 — Trend Pyramid
A pyramid ranking the most viral content categories on TikTok.
Shows which content types consistently drive high views and engagement.

### 💬 Scene 6 — Captions & Emotions
A word cloud of the most common words in viral TikTok captions. Each word is coloured by its emotional tone, revealing the themes and moods that often accompany viral content.

### ⁉️ Scene 7 — Quiz
A short interactive quiz that tests what viewers learned from the earlier scenes (_Can you go viral?_).
Uses a conveyor-belt metaphor to present multiple-choice questions based on the visualizations.

### 🛸 Scene 8 — Wrap-Up
Summarizes the key takeaways into a “Recipe for a Viral Short Video.”
Provides a final set of insights and a way to restart the journey.

## Data Sources
Data processing and transformation is handled client-side in the visualization scripts (`src/vizzes/`). 
- [TikTok Scraper](https://apify.com/clockworks/tiktok-scraper) (`cleaned_tiktok_data.csv`, `top_music.csv`, `top10_music.csv`) – Apify unofficial TikTok scraper tool
- [YouTube Shorts and TikTok Trends 2025](https://www.kaggle.com/datasets/tarekmasryo/youtube-shorts-and-tiktok-trends-2025?resource=download) (`youtube_shorts_tiktok_trends_2025.csv`) – Kaggle dataset
- [TikTok Popular Songs 2019](https://www.kaggle.com/datasets/sveta151/tiktok-popular-songs-2019) (`TikTok_songs_2019.csv`) – Kaggle dataset
- [TikTok Popular Songs 2020](https://www.kaggle.com/datasets/sveta151/tiktok-popular-songs-2020) (`TikTok_songs_2020.csv`) – Kaggle dataset
- [TikTok Popular Songs 2021](https://www.kaggle.com/datasets/sveta151/tiktok-popular-songs-2021)  (`TikTok_songs_2021.csv`) – Kaggle dataset
- [TikTok Popular Songs 2022](https://www.kaggle.com/datasets/sveta151/tiktok-popular-songs-2022) (`TikTok_songs_2022.csv`) – Kaggle dataset


## Build Guide

### Prerequisites

- **Node.js** (v18+)
- **npm**

Check your versions:

```bash
node -v
npm -v
```

### Setup

1. Clone the repo:
    
    ```bash
    git clone https://github.com/hellokathylee/tiktok-tides.git
    cd tiktok-tides
    ```
    
2. Install dependencies:
    
    ```bash
    npm install
    ```
    
3. Start the development server:
    
    ```bash
    npm run dev
    ```
    
    Open `http://localhost:3000`
    

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript
- **Data Visualization:** [D3.js v7](https://d3js.org/)
- **Build Tools:** Vite + npm
- **Deployment:** GitHub Pages

## Our Team

Say hello to Team TrendTokers!
<table>
  <tr>
    <td align="center">
      <img src="public/assets/Alien_Kathy.png" width="150" alt="Kathy" /><br/>
      <strong><a href="https://www.linkedin.com/in/hellokathylee/">Kathy Lee</a></strong><br/>
      Developer · Team Lead
    </td>
    <td align="center">
      <img src="public/assets/Alien_Kerry.png" width="150" alt="Kerry" /><br/>
      <strong><a href="https://www.linkedin.com/in/xinyuan-gu-034016219/">Kerry Gu</a></strong><br/>
      Developer
    </td>
    <td align="center">
      <img src="public/assets/Alien_Bradley.png" width="150" alt="Bradley" /><br/>
      <strong><a href="https://www.linkedin.com/in/bradleylin/">Bradley Lin</a></strong><br/>
      Developer
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="public/assets/Alien_Anushka.png" width="150" alt="Anushka" /><br/>
      <strong><a href="https://www.linkedin.com/in/anushka-sharma-28ba2525b/">Anushka Sharma</a></strong><br/>
      Developer
    </td>
    <td align="center">
      <img src="public/assets/Alien_Angela.png" width="150" alt="Angela" /><br/>
      <strong><a href="https://www.linkedin.com/in/qiansu-ca/">Angela Su</a></strong><br/>
      Developer · Narrative Designer
    </td>
    <td align="center">
      <img src="public/assets/Alien_Jon.png" width="150" alt="Jon" /><br/>
      <strong><a href="https://www.linkedin.com/in/jvincentius/">Jon Vincentius</a></strong><br/>
      Developer
    </td>
  </tr>
</table>


---

CSC316 Final Project (Fall 2025) | Team TrendTokers