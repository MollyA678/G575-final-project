# Placeholder Team

### Molly Anderson & Ray Wang

### Final Proposal
# User Profile

This visualization is designed for users who are interested in 
understanding the cultural and historical processes embedded in geographic 
naming systems. The primary audience includes students in 
geography, GIS, and urban studies, as well as researchers exploring 
cultural diffusion, historical geography, and spatial semantics. These 
users are assumed to have basic map literacy and familiarity with 
interactive web maps. They are not expected to have prior knowledge of 
place-name etymology or cultural history.

In addition, the system also targets general users who are curious about 
why certain place names appear in specific regions of the United States 
and how these names reflect broader historical processes such as 
colonization, migration, and cultural influence. Therefore, the interface 
must support both exploratory analysis and intuitive understanding, 
allowing users to gradually move from high-level patterns to detailed 
interpretations.

---

# Scenario

A user begins with a general curiosity about why many places in the United 
States share names with European locations or reflect non-local cultural 
origins. For example, the user may notice names such as “York,” “Athens,” 
or “San Antonio,” and wonder how these names emerged and spread across the 
U.S.

The user first interacts with a global-scale visualization that shows 
origin regions outside the United States and their cultural connections to 
U.S. place names. From this overview, the user gains an initial 
understanding of major source regions such as England, Spain, and Germany. 
The user then zooms into the United States to explore how these names are 
distributed spatially and how they diffuse from early settlement regions, 
particularly along the East Coast, toward inland areas.

Finally, the user investigates specific place names or clusters, examining 
their origins, similarities, and relationships to other names through both 
spatial proximity and semantic similarity. This process follows a 
progressive exploration workflow consistent with the principle of 
“overview first, zoom and filter, then details-on-demand”.

---

# ️ Requirements

## Representation

The system represents cultural diffusion of place names through multiple 
coordinated views that operate across different spatial and conceptual 
scales. At the global level, the visualization presents origin regions 
outside the United States, highlighting areas such as Europe that have 
historically contributed to U.S. place naming. These regions are connected 
to the United States using directional links that represent inferred 
cultural diffusion pathways. These links do not indicate literal migration 
routes but rather symbolic or historical connections between naming 
origins and their adoption in the U.S.

At the national level, the United States is visualized as a spatial 
distribution of place names, where each location is represented as a 
point. These points are encoded by origin category, allowing users to 
distinguish between names derived from different cultural or linguistic 
backgrounds. Additional visual encodings may include temporal categories 
or clustering structures to reveal patterns of expansion and 
concentration.

Complementing the map views, statistical representations are included to 
summarize the distribution of place names by origin and distance. These 
views help users understand aggregate patterns, such as which cultural 
sources are most dominant and how far names tend to diffuse from their 
inferred origins.

Finally, a detail view provides contextual information for selected place 
names, including their origin classification and explanatory 
interpretation.

---

## Interaction

- Overview  

The webstie begins with a global overview that presents the major origin 
regions and their connections to the United States. This allows users to 
immediately grasp the large-scale structure of cultural diffusion and 
identify dominant source regions.

- Zoom and Filter  

Users can zoom into specific geographic regions within the United States 
and apply filters based on origin categories or place types. This enables 
focused exploration of spatial patterns, such as regional clustering or 
diffusion gradients from coastal to inland areas.

- Time Evolution  

The website introduces a temporal exploration mechanism that allows users to examine how place-name diffusion evolves over time. 
Because explicit temporal data are not always available, time is represented as an inferred or categorized dimension (e.g., early 
settlement period, westward expansion period, modern naming).

Users can interact with a timeline slider or discrete temporal categories to animate the diffusion process, observing how place names 
appear and spread across the United States. This allows users to interpret diffusion not only as a spatial pattern but as a dynamic 
historical process.

 - Details-on-Demand  

When users select individual locations, the webstie reveals detailed 
information about the place name, including its origin and interpretation. 
This allows users to connect abstract patterns to specific examples 
without cluttering the main visualization.

- Coordinated Interaction  

Interactions in one view are reflected across all other views. Selecting 
an origin category highlights corresponding locations on the map and 
updates statistical charts. Similarly, selecting a geographic region 
filters the dataset and synchronizes all visual components, enabling 
integrated exploration.

---

# Conceptual Model

This project conceptualizes place names as carriers of cultural and 
historical information that exist simultaneously in multiple spaces. In 
geographic space, place names are anchored to specific locations and can 
be analyzed in terms of spatial distribution and diffusion. In semantic 
space, place names encode linguistic and cultural meaning, which can be 
extracted and compared through computational methods such as embedding. In 
relational space, place names form networks based on similarity and shared 
origin.

The visualization integrates these perspectives by combining spatial 
mapping, semantic summaries, and network representations. Cultural 
diffusion is interpreted as a process that links these spaces, 
transforming geographic distributions into interpretable patterns of 
historical and semantic relationships.

---

#  Wireframe Mock-ups

## Wireframe 1 — Global Diffusion View

![Wireframe 1](./images/wireframe1.png)

The first wireframe presents a global overview in which regions outside 
the United States are shown as sources of place names. Arrows connect 
these regions to the United States, representing inferred cultural 
diffusion. Annotations provide contextual explanations, such as historical 
transitions in naming.

---

## Wireframe 2 — U.S. Diffusion View

![Wireframe 2](./images/wireframe2.png)

The second wireframe focuses on the United States and visualizes the 
spatial distribution of place names. Points represent locations, and their 
color encodes origin or time period. Lines extending from early settlement 
regions illustrate the directional spread of place names into inland 
areas.

---

## Wireframe 3 — Network View across Scale

![Wireframe 3](./images/wireframe3.png)

The third wireframe introduces a network-based representation. Each node 
represents a place name, and edges represent similarity relationships 
between names. Node size encodes importance or frequency, while edge 
thickness represents correlation strength derived from embedding 
similarity.

This view reveals clusters of names that share linguistic or cultural 
characteristics, providing insights that are not visible in geographic 
space alone.

---

# Data Sources

- USGS GNIS  

The GNIS dataset provides official place names along with geographic 
coordinates and feature classifications. These data serve as the spatial 
backbone of the project, enabling mapping and spatial analysis of 
place-name distribution across the United States.

- StNamesLab (OpenStreetMap-derived street names)  

This dataset provides a large corpus of street names with associated 
geographic context. It serves as a linguistic resource for analyzing 
naming patterns and extracting textual features such as tokens and 
structural components.

- Token Embedding of Foundation Model (e.g., SBERT, Google Alpha Earth)  

Pre-trained geo-foundation models are used to transform place names into vector 
representations. These embeddings enable the computation of semantic 
similarity between names, which is used to construct the network 
visualization. Edge weights in the network represent correlation strength 
derived from embedding similarity.

- Other Data 

OSM street Network, Fousquare POIs, Building Footprint data, and Census data
will be used as basemap.
---

# ️ Limitations & Considerations

The diffusion paths represented in the visualization are conceptual rather 
than literal. They do not correspond to exact migration routes but instead 
reflect inferred cultural relationships. Therefore, the arrows should be 
interpreted as symbolic connections rather than physical trajectories.

Identical or similar place names do not always indicate direct historical 
inheritance. Some names are adopted symbolically or independently, and 
embedding-based similarity captures linguistic resemblance rather than 
full cultural or historical meaning. These factors should be considered 
when interpreting the results.

---
# Expected Outcome

The website will reveal how place names function as indicators of 
cultural diffusion and historical processes. By integrating spatial 
visualization, statistical summaries, and network analysis, the website 
enables users to explore place names across multiple dimensions and 
demonstrates how geographic data can be extended into semantic and relational domains, transforming simple location-based 
information into a richer understanding of cultural patterns and 
historical connections.






