/* ============================================================
   ROOM-DATA.JS — mind palace: the starting lists.
   Plain text you can edit. (Anything you add on the page itself
   is saved in your browser, not here.)

     STARTING_ARTISTS  your list the very first time the room opens
     NATURE_TAGS       your starting nature words
     MY_WORK_TAG       which of your works run across the top
     LINEAGE           hand-made family trees (used by lineages + explore)
     RELATED           more "if you like X, look at Y" pairs for explore
     ELSEWHERE         museum links for artists whose images aren't shared
     STRING_COLORS     the colors of the strings on the web + what they mean
     GRID_WEB          the grid: the first words in the mind palace
     GROUPS            the mind palace's groups, and words it already knows
     CUTOFF_YEAR       no work made after this year is shown
     ROOM_NAME         what your room is called (4 · what did you make)
     NOW               now listening / watching / reading, to start
     STARTING_LISTS    the first lists on order of operations
     INSPIRATION_PROMPTS  "need a start?" words on the inspiration list
   ============================================================ */

window.ROOM = {

  CUTOFF_YEAR: 2010,

  STARTING_ARTISTS: ["Agnes Martin", "Edvard Munch", "Ellsworth Kelly"],

  // 2 · nature: your starting tags (add more on the page)
  NATURE_TAGS: ["rocks", "alaska", "moss", "ocean"],

  // the strip of your own work across the top of the room: every work in works.js with this tag
  MY_WORK_TAG: "2026",

  /* ---------- LINEAGE ----------
     For any artist on your list, these branches show on the lineages page.
     Artists who aren't here get branches pulled from Wikidata instead
     (who influenced them, who they influenced, their movement).        */
  LINEAGE: {
    "Agnes Martin": [
      { label: "the grid", artists: ["Piet Mondrian", "Paul Klee", "Sol LeWitt", "Eva Hesse", "Jasper Johns", "Hanne Darboven", "Alfred Jensen"] },
      { label: "the square", artists: ["Kazimir Malevich", "Josef Albers", "Ad Reinhardt", "Robert Ryman", "Carmen Herrera", "Ellsworth Kelly"] },
      { label: "line + weave", artists: ["Lenore Tawney", "Anni Albers", "Sophie Taeuber-Arp", "Gego", "Mira Schendel", "Bridget Riley"] },
      { label: "color field", artists: ["Mark Rothko", "Barnett Newman", "Kenneth Noland"] }
    ],
    "Edvard Munch": [
      { label: "before him", artists: ["Vincent van Gogh", "Paul Gauguin", "Arnold Böcklin"] },
      { label: "northern light", artists: ["Vilhelm Hammershøi", "Hilma af Klint"] },
      { label: "interiors", artists: ["Édouard Vuillard", "Félix Vallotton"] },
      { label: "after him", artists: ["Ernst Ludwig Kirchner", "Emil Nolde", "Egon Schiele", "Käthe Kollwitz", "Max Beckmann", "Mark Rothko"] }
    ],
    "Ellsworth Kelly": [
      { label: "paris years", artists: ["Jean Arp", "Sophie Taeuber-Arp", "Henri Matisse", "Georges Vantongerloo", "Constantin Brancusi"] },
      { label: "coenties slip", artists: ["Agnes Martin", "Jack Youngerman", "Robert Indiana", "Lenore Tawney"] },
      { label: "hard edge + after", artists: ["Carmen Herrera", "Leon Polk Smith", "Frank Stella", "Kenneth Noland", "Blinky Palermo", "Richard Tuttle"] }
    ]
  },

  /* ---------- RELATED ----------
     Extra pairs so explore has ideas when you add these artists.
     Add a line any time: "Artist": ["someone", "someone else"],          */
  RELATED: {
    "Mark Rothko": ["Barnett Newman", "Clyfford Still", "Adolph Gottlieb", "Helen Frankenthaler", "Agnes Martin", "Milton Avery"],
    "Josef Albers": ["Anni Albers", "Johannes Itten", "Richard Anuszkiewicz", "Paul Klee", "Eva Hesse"],
    "Anni Albers": ["Josef Albers", "Lenore Tawney", "Sheila Hicks", "Gunta Stölzl", "Sophie Taeuber-Arp"],
    "Piet Mondrian": ["Theo van Doesburg", "Bart van der Leck", "Georges Vantongerloo", "Burgoyne Diller", "Fritz Glarner"],
    "Kazimir Malevich": ["El Lissitzky", "Lyubov Popova", "Aleksandr Rodchenko", "Olga Rozanova"],
    "Paul Klee": ["Wassily Kandinsky", "Lyonel Feininger", "Josef Albers", "Gunta Stölzl"],
    "Sol LeWitt": ["Eva Hesse", "Hanne Darboven", "Mel Bochner", "Donald Judd", "Agnes Denes"],
    "Eva Hesse": ["Sol LeWitt", "Louise Bourgeois", "Ruth Vollmer", "Lee Bontecou"],
    "Robert Ryman": ["Agnes Martin", "Brice Marden", "Robert Mangold", "Ad Reinhardt"],
    "Ad Reinhardt": ["Agnes Martin", "Barnett Newman", "Mark Rothko", "Robert Ryman", "Frank Stella"],
    "Vilhelm Hammershøi": ["Edvard Munch", "Carl Holsøe", "Peter Ilsted", "Giorgio Morandi"],
    "Hilma af Klint": ["Wassily Kandinsky", "Piet Mondrian", "Emma Kunz", "Edvard Munch"],
    "Lenore Tawney": ["Agnes Martin", "Sheila Hicks", "Anni Albers", "Claire Zeisler"],
    "Bridget Riley": ["Victor Vasarely", "Agnes Martin", "Josef Albers", "Georges Seurat"],
    "Carmen Herrera": ["Ellsworth Kelly", "Leon Polk Smith", "Lygia Clark", "Josef Albers"],
    "Barnett Newman": ["Mark Rothko", "Clyfford Still", "Ad Reinhardt", "Agnes Martin"],
    "Brice Marden": ["Agnes Martin", "Robert Ryman", "Jasper Johns"],
    "Giorgio Morandi": ["Vilhelm Hammershøi", "Paul Cézanne", "Agnes Martin"],
    "Vija Celmins": ["Agnes Martin", "Giorgio Morandi", "Jasper Johns"]
  },

  /* ---------- ELSEWHERE ----------
     Links shown on an artist's page, for work the open museum
     feeds can't show. Every artist page also gets search links
     to MoMA, Tate, Google Arts & Culture and Wikipedia.            */
  ELSEWHERE: {
    "Agnes Martin": [
      { where: "Dia Beacon", what: "Agnes Martin: Painting is not making paintings (opened April 4, 2026, on view for a year)", href: "https://www.diaart.org/about/press/agnes-martins-paintings-return-to-dia-beacon-in-major-exhibition", onview: true },
      { where: "MoMA", what: "every Agnes Martin in MoMA's collection that's online", href: "https://www.moma.org/artists/3787" },
      { where: "MoMA", what: "Untitled, 1978. Watercolor and colored ink on transparentized paper, 9 x 9 in.", href: "https://www.moma.org/collection/works/96613" },
      { where: "MoMA", what: "Mountain, 1960. Ink and pencil on paper", href: "https://www.moma.org/collection/works/36262" },
      { where: "Guggenheim", what: "the Guggenheim's Martins, including White Flower, 1960", href: "https://www.guggenheim.org/artwork/artist/agnes-martin" },
      { where: "Whitney", what: "Untitled #22, 2002. Acrylic and graphite on canvas, 60 x 60 in.", href: "https://whitney.org/collection/works/24993" },
      { where: "Whitney", what: "a 1990 painting, acrylic and graphite, 72 x 72 in.", href: "https://whitney.org/collection/works/8062" },
      { where: "Tate", what: "ARTIST ROOMS: Agnes Martin", href: "https://www.tate.org.uk/visit/tate-modern/display/in-the-studio/artist-rooms-agnes-martin" },
      { where: "Seattle Art Museum", what: "early-60s works, including The Cry and Waters, 1962", href: "https://art.seattleartmuseum.org/objects/11296/untitled" },
      { where: "Buffalo AKG", what: "Untitled portfolio, 1998. Lithographs, 12 x 12 in.", href: "https://buffaloakg.org/artworks/p199891-untitled-portfolio-untitled" },
      { where: "Harwood Museum, Taos", what: "the Agnes Martin Gallery: seven paintings in a room she helped design", href: "https://harwoodmuseum.org/art/collections/agnes-martin/" },
      { where: "Pace Gallery", what: "her gallery since 1975", href: "https://www.pacegallery.com/artists/agnes-martin/" }
    ]
  },

  /* ---------- THE WEB: string colors ----------
     Change the meanings here or right on the page.                    */
  STRING_COLORS: [
    { color: "#c8102e", means: "influence / lineage" },
    { color: "#2a5bd7", means: "idea / theory" },
    { color: "#e0a400", means: "place + time" },
    { color: "#222222", means: "my own link" }
  ],

  NODE_TYPES: ["concept", "artist", "work", "place + time", "source", "note"],   // (the old web's card types)

  /* ---------- 3 · THE MIND PALACE: groups ----------
     Every word you add goes into one of these groups. The palace guesses
     from the lists below first, then asks Wikipedia what the word is.
     You can always move a word to another group. Add words to the lists
     any time and the palace will know them.                              */
  GROUPS: ["ideas", "artists", "places", "nature", "colors", "materials", "culture", "sources", "works"],
  GROUP_WORDS: {
    colors: ["gray", "grey", "white", "black", "red", "blue", "green", "yellow", "orange", "purple", "pink", "brown", "beige", "ochre", "umber",
             "sienna", "teal", "indigo", "violet", "gold", "silver", "cream", "ivory", "navy", "cyan", "magenta", "turquoise", "lavender", "lilac",
             "rust", "olive", "maroon", "color", "colour", "pastel colors", "neon"],
    materials: ["graphite", "chalk", "pencil", "colored pencil", "charcoal", "ink", "paper", "graph paper", "canvas", "raw canvas", "linen", "wax",
                "clay", "wool", "thread", "cotton", "silk", "oil paint", "acrylic", "gouache", "watercolor", "pastel", "gesso", "plaster", "wood",
                "glass", "felt", "tape", "cardboard", "warp + weft", "weave", "quilt", "pigment"],
    nature: ["jellyfish", "moss", "ocean", "sea", "water", "ice", "glacier", "snow", "sky", "cloud", "tree", "forest", "leaf", "flower", "bird",
             "whale", "fish", "moon", "sun", "star", "light", "wind", "rain", "mountain", "river", "lake", "desert", "sand", "shell", "coral",
             "fern", "mushroom", "lichen", "fog", "weather", "tide", "wave", "insect", "butterfly", "bee", "dog", "cat", "horse", "rock", "stone"],
    places: ["alaska", "new york", "manhattan", "brooklyn", "new mexico", "taos", "paris", "iceland", "norway", "japan", "coenties slip",
             "street grid", "the map"],
    culture: ["neopets", "the beatles", "myspace", "tumblr", "video game", "pokemon", "cartoon", "anime", "the internet", "the pixel"]
  },

  /* ---------- THE FIRST WEB: the grid ----------
     x, y = where each card sits (0, 0 is the middle).
     links: [from, to, color number (0 = first color above), label]    */
  GRID_WEB: {
    name: "the grid",
    nodes: [
      { id: "grid", label: "the grid", type: "concept", x: 0, y: 0, notes: "the backbone of this room." },
      { id: "martin", label: "Agnes Martin", type: "artist", x: -280, y: -120, notes: "graphite grids over thin paint, early 1960s; horizontal bands later." },
      { id: "kelly", label: "Ellsworth Kelly", type: "artist", x: -60, y: -270, notes: "Spectrum Colors Arranged by Chance (1951–53): colored squares placed on a grid by chance." },
      { id: "mondrian", label: "Piet Mondrian", type: "artist", x: 240, y: -170, notes: "" },
      { id: "malevich", label: "Kazimir Malevich", type: "artist", x: 380, y: -40, notes: "" },
      { id: "lewitt", label: "Sol LeWitt", type: "artist", x: 310, y: 150, notes: "" },
      { id: "anni", label: "Anni Albers", type: "artist", x: -420, y: 130, notes: "" },
      { id: "hammershoi", label: "Vilhelm Hammershøi", type: "artist", x: 330, y: -330, notes: "" },
      { id: "krauss", label: "\"Grids\", Rosalind Krauss, 1979", type: "source", x: -40, y: 210, notes: "essay in October no. 9: the grid as the emblem of modern art (flat, anti-natural, anti-narrative)." },
      { id: "modernism", label: "modernism", type: "concept", x: 160, y: 290, notes: "" },
      { id: "minimal", label: "minimalism + seriality", type: "concept", x: 470, y: 260, notes: "" },
      { id: "repeat", label: "repetition / meditation", type: "concept", x: -250, y: 60, notes: "" },
      { id: "paper", label: "graph paper", type: "concept", x: -170, y: 340, notes: "" },
      { id: "weave", label: "warp + weft", type: "concept", x: -520, y: -20, notes: "weaving is a grid: threads crossing at right angles." },
      { id: "quilt", label: "quilts", type: "concept", x: -650, y: 120, notes: "" },
      { id: "pixel", label: "the pixel", type: "concept", x: -520, y: 280, notes: "the digital image as a grid of colored squares." },
      { id: "map", label: "the map: latitude + longitude", type: "concept", x: -340, y: -310, notes: "" },
      { id: "nyc", label: "Manhattan street grid, 1811", type: "place + time", x: -580, y: -240, notes: "the Commissioners' Plan of 1811 laid out the street grid." },
      { id: "window", label: "the window", type: "concept", x: 110, y: -360, notes: "panes as a grid; looking out from inside." },
      { id: "alberti", label: "Alberti's veil, 1435", type: "source", x: 560, y: -210, notes: "in On Painting, a net of threads stretched in a frame, used to transfer what you see onto a squared surface." },
      { id: "squaring", label: "squaring up", type: "concept", x: 640, y: -50, notes: "drawing a grid over a study to transfer or enlarge it." }
    ],
    links: [
      ["grid", "martin", 0], ["grid", "kelly", 0], ["grid", "mondrian", 0], ["grid", "malevich", 0], ["grid", "lewitt", 0],
      ["grid", "krauss", 1], ["krauss", "modernism", 1], ["modernism", "mondrian", 1], ["modernism", "malevich", 1],
      ["lewitt", "minimal", 1], ["martin", "minimal", 1, "she didn't call herself one"],
      ["martin", "kelly", 2, "Coenties Slip, 1950s"], ["martin", "repeat", 3], ["repeat", "paper", 3], ["grid", "paper", 3],
      ["grid", "weave", 1], ["weave", "anni", 0], ["weave", "quilt", 3], ["quilt", "pixel", 3], ["pixel", "paper", 3],
      ["grid", "map", 1], ["map", "nyc", 2], ["grid", "alberti", 1], ["alberti", "squaring", 1],
      ["grid", "window", 1], ["window", "hammershoi", 0]
    ]
  },

  ROOM_NAME: "trinity's room",

  NOW: [
    { label: "now listening", title: "jazz dreams", by: "fine" },
    { label: "now watching", title: "twin peaks" },
    { label: "now reading", title: "dance dance dance", by: "haruki murakami" }
  ],

  STARTING_LISTS: [
    { name: "before the next drawing", items: ["pick the paper", "choose 4 colors from the bank", "sketch the grid", "start"] },
    { name: "wishlist", items: ["a flat file", "good graphite", "a trip to dia beacon"] }
  ],

  // one click adds any of these to the inspiration list. add as many as you like.
  INSPIRATION_PROMPTS: ["the grid", "moss", "rocks", "alaska", "fog", "lichen", "tide pools", "glaciers", "ferns", "snow", "rain on glass",
    "early internet", "geocities", "pixel art", "ascii art", "screensavers", "windows 95", "myspace", "tumblr", "zines", "photocopies",
    "graph paper", "weaving", "quilts", "maps", "star charts", "botanical drawings", "herbariums", "museum labels", "archives",
    "audrey hepburn", "agnes martin", "hilma af klint", "anni albers", "mark rothko", "edvard munch", "louise bourgeois", "yayoi kusama",
    "twin peaks", "film stills", "polaroids", "contact sheets", "old postcards", "stained glass", "church pews", "tiles", "mosaics",
    "jellyfish", "moths", "birds in flocks", "horses", "dogs", "bees", "honeycomb", "shells", "minerals", "geodes", "volcanoes",
    "the ocean", "horizon lines", "sunsets", "night sky", "the moon", "grids of windows", "fire escapes", "subway tiles", "brooklyn",
    "handwriting", "receipts", "lists", "calendars", "diaries", "letters", "typewriters", "sewing patterns", "knitting", "embroidery",
    "jazz", "radio static", "wallpaper", "carpet patterns", "gray", "blue", "white on white", "silence", "repetition", "erosion"],

};
