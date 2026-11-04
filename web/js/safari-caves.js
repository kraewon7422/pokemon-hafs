// tools/gen_safari_caves.py 가 만듦 — 손으로 고치지 말 것. 동굴 던전 지도 (여울의 동굴 · 미혹의 동굴 · 깊은 동굴, 층마다 미로).
// warps 의 [지도, 'in'] 꼴은 바깥 지도의 PORTS 이름 (safari-maps.js 가 좌표로 바꿈). PORTS = 바깥에서 동굴로 들어올 때 서는 칸.
export const CAVES = {
 "shoal1": {
  "name": "여울의 동굴",
  "kind": "cave",
  "zone": "cave",
  "rows": [
   "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
   "WV.W..............W..W...........O..W",
   "WS.W....r.........W..W...........O..W",
   "W..WWWW..WWWWWWW.rW..W..WWWWWWW..WWWW",
   "W..W.....W.....r.rW.....W.....W.....W",
   "W..W.....W...r....W.....W.....W.....W",
   "W..W..WWWW..WWWWWWWWWWWWW..W..WWWW..W",
   "W..W.....W.................W..W.....W",
   "Wr.W.~~~.W..........~~~....W..W.....W",
   "W..W.~~~.WWWWWWWWWW.~~~.WWWW..W..WWWW",
   "W.r..~~~.W..O..O..W.~~~.....r.......W",
   "W........W..O..O..W.................W",
   "WWWWWWWWWW..WOOWWWW..WWWWWWWWWWWWW..W",
   "W....O...W..W........W...........W..W",
   "W....O...W..W.~~~....W......r....W..W",
   "W..WWWW..W..W.~~~.WWWWWWWWWW..W..W..W",
   "W..W..W..W..W.~~~.W...........W.....W",
   "W..W..W..W..W.....W...........W.....W",
   "W..W..W..W..W..W..W..WWWWWWW..WWWW..W",
   "W..W.....W...........W........W.....W",
   "W..W.....W...........W........W.....W",
   "W..WWWWWWWWWWWWWWWWWWW..WWWWWWW..WWWW",
   "W..W.....W..............W..O.....W..W",
   "W..W..r.rW..............W..O.....W..W",
   "W..W..W..W..WWWWWWW..WWWW..WWWWWWW..W",
   "W.....W...........WS................W",
   "W.....W...........W.................W",
   "WWWWWWWWWWWWWWWWWWWEWWWWWWWWWWWWWWWWW"
  ],
  "warps": {
   "19,27": [
    "safari",
    8,
    3,
    "down"
   ],
   "1,1": [
    "shoal2",
    17,
    16,
    "right"
   ]
  },
  "signs": {
   "19,25": "여울의 동굴. 이 층 어딘가에 아래로 가는 길이 있다. 막다른 길에 주의!",
   "1,2": "↓ 지하 1층 (사다리)"
  },
  "npcs": [],
  "legends": []
 },
 "shoal2": {
  "name": "여울의 동굴 지하 1층",
  "kind": "cave",
  "zone": "cave",
  "rows": [
   "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
   "WS..........W........W....O.........W",
   "W.o.........W........W....O.........W",
   "WWWWWWWWWW..W..WWWW..W..WWWWWWWWWW..W",
   "W..W........W.....W..W..W........WOOW",
   "W..W........W.....W..W..W........W..W",
   "W..W..WWWWWWWWWW..W..W..WWWW..W..W..W",
   "W..W.............rW..W........W..W..W",
   "W..W............r.W..W........W..W..W",
   "W..WWWWWWWWWWWWWWWW..WWWWWWWWWWWWW.rW",
   "W.....W.....r.....W..W...........W..W",
   "W.....W...........W..W..r........W..W",
   "W..WWWW..WWWWWWW..W..W..WWWWWWW..W..W",
   "W.....W..W.....W..W.....W.....W...r.W",
   "W...r.W..W.....W..W.....W.....W.....W",
   "W..W..W..W..W..WS.WWWWWWWWWW..W..W..W",
   "W..Wr....W..W...U.......W.....W..W..W",
   "W..W.....W..W...........W.....W..W..W",
   "W..WWWWWWW..WWWWWWWWWW..W..W..W..W..W",
   "W.....W..W...........W.....W..W.....W",
   "W....oW..W...........W.....W..W.....W",
   "WWWW..W..WWWWWWWWWW..WWWWWWW..W..W..W",
   "W..W..W...........W..O..WO.O..W..W..W",
   "W..W..W.......~~~.W..O..WO.O.rW..W..W",
   "W..W..W..WWWW.~~~.WWWW..WWWW..W..W..W",
   "W........W....~~~..O.W.........r....W",
   "W....o...W.........O.W..............W",
   "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW"
  ],
  "warps": {
   "16,16": [
    "shoal1",
    2,
    1,
    "right"
   ],
   "2,2": [
    "shoal3",
    28,
    7,
    "down"
   ],
   "5,26": [
    "shoal3",
    1,
    16,
    "down"
   ],
   "5,20": [
    "shoal3",
    28,
    10,
    "down"
   ]
  },
  "signs": {
   "16,15": "여울의 동굴 지하 1층. 이 층 어딘가에 아래로 가는 길이 있다. 막다른 길에 주의!",
   "1,1": "구멍에 떨어지면 아래층으로! 돌아오려면 그 층의 사다리를 찾자."
  },
  "npcs": [],
  "legends": []
 },
 "shoal3": {
  "name": "여울의 동굴 지하 2층",
  "kind": "cave",
  "zone": "cave",
  "rows": [
   "WWWWWWWWWWWWWWWWWWWEWWWWWWWWWWWWWWWWW",
   "WV.S..W..............W..W...........W",
   "W.....W....r.........W..W...........W",
   "WWWW.BW..WWWWWWWWWW..WOOW..W..WWWW..W",
   "W........W...........W.....W..W.....W",
   "W........W...........W.....W..W.~~~.W",
   "W....L...W..WWWWWWWWWW.rWWWWS.W.~~~.W",
   "W........W........W........W..W.~~~.W",
   "W........W....r...W..r.....W..W.....W",
   "W..WWWW..WWWW..W..W..WWWWWWW..W..W..W",
   "W..W........W.....WU.W..W.....W..O..W",
   "W..W........W...r.W..W..W.....W..O..W",
   "W..WWWWWWWWWW..WWWW..W..W..WWWWWWW..W",
   "W..W...O.O..W.....W..W..W........W..W",
   "W..W...O.O..W..r..W..W..W........W..W",
   "W..W..WWWW..WWWW..W..W..WWWWWWW..WWWW",
   "W..W..W..W..W.....W..W.........r....W",
   "W..W..W..W..W.~~~.W..W.......~~~....W",
   "W..W..W..W..W.~~~.W..WWWW..W.~~~.W..W",
   "W..W.....W..W.~~~..........W.~~~..r.W",
   "W..W.....WOOW...........r..W........W",
   "W..WWWW..W..W..WWWWWWWWWWWWW..W..WWWW",
   "W.....W..W.....W........W.....Wr....W",
   "W..r..W..W.....W........W.....W.....W",
   "W..WWWW..WWWWWWW..WWWW..WWWWWWWWWW..W",
   "W..O..............W.................W",
   "W..O...r..........W.................W",
   "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW"
  ],
  "warps": {
   "19,10": [
    "shoal2",
    17,
    16,
    "down"
   ],
   "1,1": [
    "shoal4",
    26,
    16,
    "right"
   ],
   "19,0": [
    "deepPond",
    "in"
   ]
  },
  "signs": {
   "5,3": "벽에 점자가 새겨져 있다… \"깊은 곳에 잠든 거인을 깨우려면 세 개의 돌을 모아라.\"",
   "28,6": "여울의 동굴 지하 2층. 이 층 어딘가에 아래로 가는 길이 있다. 막다른 길에 주의!",
   "3,1": "↓ 지하 3층 (사다리)"
  },
  "npcs": [],
  "legends": [
   {
    "dex": 378,
    "x": 5,
    "y": 6
   }
  ]
 },
 "shoal4": {
  "name": "여울의 동굴 지하 3층",
  "kind": "cave",
  "zone": "cave",
  "rows": [
   "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
   "W.................W........r........W",
   "W.................W.......~~~.......W",
   "W..WWWW..WWWWWWW.rW..WWWW.~~~.W..W..W",
   "W~~~~~~~~...W.............~~~.O..W..W",
   "W...........W.......~~~.......O..W..W",
   "W....L...W..W..WWWW.~~~.WWWW..WWWW..W",
   "W..............W....~~~.W..O..W.....W",
   "W..............W........W..O..W.....W",
   "W..W..W..WWWW..W..WWWWWWW..WWWW..WWWW",
   "W..W.....W........W......r.W..W..W.rW",
   "W..W.....W...r....W........W..W..W..W",
   "W..WWWWWWW..WWWWWWW..WWWWWWW..W..W..W",
   "W.....W.....W..W........W........W..W",
   "W.....W.~~~.W..Wr.......W........W..W",
   "WWWW..W.~~~.W..W..WWWW..WS.WWWWWWW..W",
   "W.....W.~~~....W.....W..WU.O........W",
   "W.....W.......rW.....W..W..O........W",
   "W..W..W..W..WWWWWWW..W..WWWWWWWWWW..W",
   "W...r....W.......O...W..O..W........W",
   "W........W.......O...W..O..W........W",
   "W..WWWW..WWWWWWWWWWWWW..W..W..WWWWWWW",
   "W..W.......................W..W.....W",
   "W..W.......................W.rW.....W",
   "W..W..WWWWWWWWWWWWWWWWWWWWWW..W..W..W",
   "W.....W..................O.......W.rW",
   "W.....W................r.Or......W..W",
   "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW"
  ],
  "warps": {
   "25,16": [
    "shoal3",
    2,
    1,
    "right"
   ]
  },
  "signs": {
   "25,15": "여울의 동굴 지하 3층. 가장 깊은 층이다. 전설의 포켓몬이 있다는 소문이…"
  },
  "npcs": [],
  "legends": [
   {
    "dex": 249,
    "x": 5,
    "y": 6
   }
  ]
 },
 "maze1": {
  "name": "미혹의 동굴",
  "kind": "cave",
  "zone": "cave",
  "rows": [
   "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
   "WS.W........W.......................W",
   "W.oW........W................r......W",
   "W..WWWW..Wr.WWWWWWWWWWWWW..WWWWWWW..W",
   "W........W..W.....W.r......W.....W..W",
   "W........W..W.....W........W.....W..W",
   "WWWWWWWWWW..W..W..W.rWWWWWWW..W..W..W",
   "W..W.....W.....Wr.W.....WOOW..W.....W",
   "W..W.....W.....W..W.....W..W..W.....W",
   "W..W..W..WWWWWWW..WWWW..W..W..WWWWWWW",
   "W.....W........W........W..W..W.....W",
   "W.....W........W........W..W..W.....W",
   "W..WWWWWWW..W..WWWWWWWWWW..W..W..W..W",
   "W..Wrr...W..W........W........W..W..W",
   "W..W.....W..W........W........W..W..W",
   "W..W..WWWW..WWWWWWWOOW..WWWWWWWWWW..W",
   "W..W.....W.....W..O..W.....W.....O..W",
   "W..Wro...W.....W..O..W..r..W.....O..W",
   "W..WWWW..WWWW..WWWWWWWWWW..WWWW..W..W",
   "W.....W.....W...........W..W..O..W..W",
   "W.....W.....W.......r...W.rW..O..W..W",
   "WWWW..WWWW..WWWWWWW..W..W..W..WWWWWWW",
   "W.rW...........W...r.W.....W........W",
   "W..W...........W.....W.....W.o......W",
   "W..WWWW.....W..W..W..WWWWWWWWWW.....W",
   "W..............O..WS................W",
   "W..............O..W...............r.W",
   "WWWWWWWWWWWWWWWWWWWEWWWWWWWWWWWWWWWWW"
  ],
  "warps": {
   "19,27": [
    "safari",
    54,
    3,
    "down"
   ],
   "2,2": [
    "maze2",
    16,
    7,
    "down"
   ],
   "5,17": [
    "maze2",
    16,
    13,
    "down"
   ],
   "29,23": [
    "maze2",
    34,
    10,
    "down"
   ]
  },
  "signs": {
   "19,25": "미혹의 동굴. 이 층 어딘가에 아래로 가는 길이 있다. 막다른 길에 주의!",
   "1,1": "구멍에 떨어지면 아래층으로! 돌아오려면 그 층의 사다리를 찾자."
  },
  "npcs": [],
  "legends": []
 },
 "maze2": {
  "name": "미혹의 동굴 지하 1층",
  "kind": "cave",
  "zone": "cave",
  "rows": [
   "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
   "W.....W......r.W.................W..W",
   "W.....W........Wr................WOOW",
   "WWWW..WWWW.rW..W..WWWW.....WWWW..W..W",
   "W..W........WOOW..W...........W.....W",
   "W..W........WOOW..W...........W.....W",
   "W..WWWWWWWWWW..WWWW..W..WWWW..WWWW..W",
   "W...r.......WU.S.....W........W.....W",
   "W........r..W........W........Wr....W",
   "W.....WWWW..WWWWWWWWWW..WWWWWWW..WWWW",
   "W.....W........W..............W..W..W",
   "W....rW........W..............WOOW..W",
   "WOOW..W..WWWW..WWWWWWW..WWWW..W..W..W",
   "W.....W.....W.....W.....W........W..W",
   "W..r..W.....W.....W.....W.....r.rW..W",
   "WWWW..WWWW..WWWW..W..W..W..WWWWWWW..W",
   "W..W.....W.....W.....W..W..W..W.....W",
   "W..W.....W.....W.....W..W..W..W.....W",
   "W..WWWW..WWWW..WWWW..WWWW..W..W..W..W",
   "W........WV.W..W.....W.....W.....W..W",
   "W........WS.W..W.....W.....W.....W..W",
   "W..WWWWWWW..W..WWWWWWW..WWWWWWWWWW..W",
   "W..W.....W..W..W.....W..W...........W",
   "W..W.....W..W..W.....W..W...........W",
   "W..W..W..W..W..W..WOOW..W..WWWWWWW..W",
   "W.r...W.....W.....W........W........W",
   "W.....W.....W.....W........W........W",
   "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW"
  ],
  "warps": {
   "13,7": [
    "maze1",
    19,
    26,
    "down"
   ],
   "10,19": [
    "maze3",
    29,
    19,
    "right"
   ]
  },
  "signs": {
   "15,7": "미혹의 동굴 지하 1층. 이 층 어딘가에 아래로 가는 길이 있다. 막다른 길에 주의!",
   "10,20": "↓ 지하 2층 (사다리)"
  },
  "npcs": [],
  "legends": []
 },
 "maze3": {
  "name": "미혹의 동굴 지하 2층",
  "kind": "cave",
  "zone": "cave",
  "rows": [
   "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
   "W..W................................W",
   "W..W................................W",
   "W..W..W..W..W..W.....WWWWWWWWWWWWW..W",
   "W..W.....W..W..W........W........W..W",
   "W..W.....W..W..W........W........W..W",
   "W..WWWW..W..WWWW..WWWW..WWWWWWW..W..W",
   "W.....W..W..W.....W.....W........W..W",
   "W.....W..W..W.....W.....W..r....oW..W",
   "WWWWOOW..W..W.....W..WWWW..WWWWWWW..W",
   "W.....W..W........O..W..........rW..W",
   "W.....W..W........O..W...........W..W",
   "W..WWWWWWWWWW..W..WWWW..WWWWWWW..W..W",
   "W........O.....W..O..W.rW........W..W",
   "W........O.....Wr.O..W..W........W..W",
   "WWWWWWWWBW..W..WWWW..WWWW..WWWW..W..W",
   "WS.....r....W.....W..W.....WOOW..W..W",
   "W.o.........W.....W..W.....W..W..W..W",
   "W..W....L...WWWW..WOOW..WWWWS.W..W..W",
   "W..............W..W..W..W..WU....W..W",
   "W..............W..W.rW..W..W.....W..W",
   "WWWW..WWWWWWW..WWWW..W..W..W..WWWW..W",
   "W.....W.....W........W..W........W..W",
   "W.....W.....W........W..W........W..W",
   "W..WWWW.rW..W.....WWWW..WWWWWWWWWW..W",
   "W........W........W...............r.W",
   "W........W..rr....W....o............W",
   "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW"
  ],
  "warps": {
   "28,19": [
    "maze2",
    11,
    19,
    "right"
   ],
   "2,17": [
    "maze4",
    25,
    1,
    "down"
   ],
   "32,8": [
    "maze4",
    34,
    1,
    "down"
   ],
   "23,26": [
    "maze4",
    19,
    1,
    "down"
   ]
  },
  "signs": {
   "8,15": "벽에 점자가 새겨져 있다… \"깊은 곳에 잠든 거인을 깨우려면 세 개의 돌을 모아라.\"",
   "28,18": "미혹의 동굴 지하 2층. 이 층 어딘가에 아래로 가는 길이 있다. 막다른 길에 주의!",
   "1,16": "구멍에 떨어지면 아래층으로! 돌아오려면 그 층의 사다리를 찾자."
  },
  "npcs": [],
  "legends": [
   {
    "dex": 377,
    "x": 8,
    "y": 18
   }
  ]
 },
 "maze4": {
  "name": "미혹의 동굴 지하 3층",
  "kind": "cave",
  "zone": "cave",
  "rows": [
   "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
   "W...O..........W........S..W........W",
   "W...O..........W...........W........W",
   "WWWWWWWWWWWWW..W..W.rWWWW..W..WWWW..W",
   "W...........W..W..W..WOOW..W.....W..W",
   "W...........W..W..W..W..W..W.....WOOW",
   "W..WWWW..W..W..WWWW..W..W..W.....W..W",
   "W.....W..W...r.......W..W..W........W",
   "W..r..W..W...........W..W..W........W",
   "WWWWWWW..W..WWWWWWWWWW..W..W..WWWW..W",
   "W.....W..W..W...........W.....W.....W",
   "W.....W..W..W...........W.....W.....W",
   "W..W..W..W..W..WWWW..W..WWWWWWWOOWWWW",
   "W..W..W..W..W..W..W..Wr..O.WU....W..W",
   "W..W..W..W..W..W..W..W...O.W.....W..W",
   "W..W..W..W..W..W..W..WWWWWWW..WWWW..W",
   "W..WV....W..W.................W.....W",
   "W..W.....W..W....rr...........W.....W",
   "W..WWWWWWWWWWWWW..WWWW..WWWWWWW..WWWW",
   "W.....W..O....r..rW.................W",
   "W.....W..O........W.................W",
   "W..W.rW..WWWWWBWWWW..WWWWWWW..WWWW..W",
   "W........Wr.......W........W.....W..W",
   "W........W........W........W.....W..W",
   "W.....WWWW....L...WWWWWWW..WWWW..W..W",
   "W..........................W........W",
   "W..........................W....r...W",
   "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW"
  ],
  "warps": {
   "28,13": [
    "maze3",
    29,
    19,
    "down"
   ],
   "4,16": [
    "regiShrine",
    "in"
   ]
  },
  "signs": {
   "14,21": "벽에 점자가 새겨져 있다… \"깊은 곳에 잠든 거인을 깨우려면 세 개의 돌을 모아라.\"",
   "24,1": "미혹의 동굴 지하 3층. 가장 깊은 층이다. 전설의 포켓몬이 있다는 소문이…"
  },
  "npcs": [],
  "legends": [
   {
    "dex": 379,
    "x": 14,
    "y": 24
   }
  ]
 },
 "deep1": {
  "name": "깊은 동굴",
  "kind": "cave",
  "zone": "cave",
  "rows": [
   "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
   "W........W...........W...........W..W",
   "W........W...........W...........W..W",
   "WWWWWWW..W..W..WWWW..WS.W..WWWW..W..W",
   "W........W..W..W.....WV.W..W.....W..W",
   "W........W..W..W.r...W..W..W.....W..W",
   "W..WWWWWWWWWW..W..WWWWWWW..W..W.rW..W",
   "W..............W...........W..W.....W",
   "W....r.r.......W...rr....r.W..W.....W",
   "W.....WWWW..WWWWWWWWWWWWWWWW..WWWW.rW",
   "W.....W..W..W..W...........W........W",
   "W.....W..W..W..W...........W.....r..W",
   "W..W..W..W..W..W..WWWWWWW..WWWWWWW..W",
   "W..W.....W..W.....W...........W.....W",
   "W..W.....W..W.....W...........W.....W",
   "W..WWWW..W..WWWWWWW..WWWWWWW..W..WWWW",
   "W..W.....W.....W.....W.....W..W.....W",
   "W..W.....W.....W.....W.....W..W.....W",
   "W..WWWWWWWWWW..W..WWWW..WWWW..W..WOOW",
   "W...........W..W..W..O........W.....W",
   "W.........r.W..W..W..O........W.....W",
   "WWWWWWWWWW..W..W..WWWWWWWWWWWWWWWW..W",
   "W........W...........O..O........W..W",
   "W........W...........O..O........W..W",
   "W..W.....WWWWWWW..WWWWWWWWWWWWW..W..W",
   "W.r...........O...S....O............W",
   "W.............O........O............W",
   "WWWWWWWWWWWWWWWWWWWEWWWWWWWWWWWWWWWWW"
  ],
  "warps": {
   "19,27": [
    "safari",
    32,
    18,
    "down"
   ],
   "22,4": [
    "deep2",
    17,
    4,
    "right"
   ]
  },
  "signs": {
   "18,25": "깊은 동굴. 이 층 어딘가에 아래로 가는 길이 있다. 막다른 길에 주의!",
   "22,3": "↓ 지하 1층 (사다리)"
  },
  "npcs": [],
  "legends": []
 },
 "deep2": {
  "name": "깊은 동굴 지하 1층",
  "kind": "cave",
  "zone": "cave",
  "rows": [
   "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
   "W..W.................W........W.....W",
   "W..W.................W........W.....W",
   "W..WWWWOOW..WWWWWWW..W..W..WWWW..W..W",
   "W.....W..W..W...U.W..W..W........W.rW",
   "W.....W..W.rW...S.W..WOOW........W..W",
   "WWWW..WWWW..W..W..W..WWWWWWWWWWWWW..W",
   "W..W........W.....W.......O......W..W",
   "W..W..r.....W.....W.......O......W..W",
   "W..WWWWWWWWWW.....WWWWWWWWWWWWW..W..W",
   "W.............................W.....W",
   "W.............................W.....W",
   "W..WWWWWWW..WWWWWWWWWWWWWWWW..W.....W",
   "W..W.....W..W.............O.........W",
   "W..W.....W..W.......o.....O.........W",
   "W..W..W..W..W..WWWWWWWWWWWWWWWW..WWWW",
   "W..W..W..W..W..W............O....WOOW",
   "W..W..W..W..W.oW.....r......O....W..W",
   "W..W..W..WWWW..W..WWWWWWWWWWWWWWWW..W",
   "W.....W........W..Wr....W...........W",
   "Wr....W........W..W.....W...........W",
   "W.....WWWWWWW..W..W..W..Wr.WWWWWWW..W",
   "W.....W.....W..W.....W..WS.W........W",
   "W.....W.....W..W.....W..W.oW........W",
   "W..WWWW..W..WWWWWWWWWW..WWWW..W..W..W",
   "W........W....................W.....W",
   "W...r....W...............r....W.....W",
   "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW"
  ],
  "warps": {
   "16,4": [
    "deep1",
    23,
    4,
    "right"
   ],
   "26,23": [
    "deep3",
    4,
    7,
    "down"
   ],
   "20,14": [
    "deep3",
    10,
    13,
    "down"
   ],
   "14,17": [
    "deep3",
    28,
    16,
    "down"
   ]
  },
  "signs": {
   "16,5": "깊은 동굴 지하 1층. 이 층 어딘가에 아래로 가는 길이 있다. 막다른 길에 주의!",
   "25,22": "구멍에 떨어지면 아래층으로! 돌아오려면 그 층의 사다리를 찾자."
  },
  "npcs": [],
  "legends": []
 },
 "deep3": {
  "name": "깊은 동굴 지하 2층",
  "kind": "cave",
  "zone": "cave",
  "rows": [
   "WEWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
   "W........W.........U..........W.....W",
   "W........W....................W.....W",
   "WWWW.....WWWW..W..W..W..W..W..WOOW..W",
   "W.....r.....W..W..W..W..WOOW..W.....W",
   "W...........W..W..W..W.rW..W..W.....W",
   "W..WWWWWWW..W..W..WWWW..W..W..W.....W",
   "W..W.S......W..W........W..W..W.....W",
   "WOOW........W..W........W..W..W.....W",
   "W..W..WWWWWWW..WWWWWWWWWW..W..W..W..W",
   "W.....W.....W........W.....W....r...W",
   "W.....W.....W........W.....W........W",
   "W..WWWW..W..WWWWWWW..W..WWWW....L...W",
   "W..W..W..W..W.......................W",
   "W..W..W..Wr.W.......................W",
   "W..W..W..W..W..WWWW..Q..WWWWWWW..WWWW",
   "W..W.....W..W..W..............W.....W",
   "W..W.....W..W..W............r.W.....W",
   "W..WWWWWWW..W..WWWWWWW..WWWW..WWWWOOW",
   "W..W.....W.....W.....W..W.....W.....W",
   "W..W.....W.....W...r.W..W.....W.....W",
   "W..W..W..W..WWWW..W..W..W..W..W..W..W",
   "W.....W.....O.....W....rW.....W..W..W",
   "W.....W.....O.....W.....W.....W..W..W",
   "W..WWWW..WWWWWWWWWWWWWWWWWWWWWW..W..W",
   "W.................O..............W..W",
   "W...r.............O..............W..W",
   "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW"
  ],
  "warps": {
   "19,1": [
    "deep2",
    17,
    4,
    "down"
   ],
   "1,0": [
    "skyHill",
    "in"
   ],
   "21,15": [
    "ultra",
    "in",
    "warp"
   ]
  },
  "signs": {
   "5,7": "깊은 동굴 지하 2층. 가장 깊은 층이다. 전설의 포켓몬이 있다는 소문이…"
  },
  "npcs": [],
  "legends": [
   {
    "dex": 383,
    "x": 32,
    "y": 12
   }
  ]
 }
};
export const CAVE_PORTS = {"shoal.in": ["shoal1", 19, 26, "up"], "shoal3.out": ["shoal3", 19, 1, "down"], "maze.in": ["maze1", 19, 26, "up"], "maze4.down": ["maze4", 5, 16, "right"], "deep.in": ["deep1", 19, 26, "up"], "deep3.out": ["deep3", 1, 1, "down"], "deep3.worm": ["deep3", 22, 15, "right"]};
