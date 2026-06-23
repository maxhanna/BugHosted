using maxhanna.Server.Controllers.DataContracts.News;
using maxhanna.Server.Controllers.DataContracts.Metadata;
using maxhanna.Server.Controllers;
using maxhanna.Server.Controllers.DataContracts.UserEvents;
using System.Web;
using System.Net;
using MySqlConnector;
using System.Text.RegularExpressions;
using System.Text;
using System.Globalization;
using maxhanna.Server.Helpers;

public class NewsService
{
  private readonly IConfiguration _config;
  private readonly Log _log;
  int newsServiceAccountNo = 308;
  int cryptoNewsServiceAccountNo = 309;
  int memeServiceAccountNo = 314;
  int musicServiceAccountNo = 399;
  private const string MemeFolderPath = "E:/Dev/maxhanna/maxhanna.client/src/assets/Uploads/Meme/";
  private static readonly HashSet<string> Stopwords = new(StringComparer.OrdinalIgnoreCase)
  {
    "the", "and", "a", "an", "of", "to", "in", "for", "on", "with", "at", "by", "from", "up",
    "about", "as", "into", "like", "through", "after", "over", "between", "out", "against",
    "during", "without", "before", "under", "around", "among", "is", "are", "was", "were", "be",
    "has", "had", "have", "it", "this", "that", "these", "those", "you", "i", "he", "she", "they",
    "we", "but", "or", "so", "if", "because", "while", "just", "not", "no", "yes", "his", "her",
    "them", "my", "your", "its", "their", "our", "me", "him", "us", "them", "who", "whom", "which",
    "what", "where", "when", "why", "casino", "how", "all", "any", "some", "many", "much", "more", "most",
    "few", "fewer", "least", "less", "such", "same", "other", "another", "each", "every", "either",
    "neither", "both", "one", "two", "three", "first", "second", "third", "last", "next", "previous",
    "then", "now", "there", "here", "wherever", "whenever", "however", "therefore", "thus", "hence",
    "although", "though", "even", "unless", "until", "whereas", "despite", "new", "old", "long", "short",
    "big", "small", "large", "high", "low", "good", "bad", "right", "wrong", "true", "false", "same",
    "different", "important", "interesting", "difficult", "easy", "quick", "slow", "happy", "sad",
    "angry", "surprised", "excited", "bored", "tired", "scared", "worried", "confused", "relaxed", "calm",
    "ready", "willing", "able", "likely", "unlikely", "possible", "impossible", "necessary", "unnecessary",
    "available", "unavailable", "useful", "useless", "helpful", "harmful", "safe", "unsafe", "healthy",
    "unhealthy", "rich", "poor", "famous", "unknown", "popular", "unpopular", "beautiful", "ugly", "clean",
    "dirty", "clear", "unclear", "simple", "complex", "normal", "abnormal", "usual", "unusual", "common",
  };
  private static readonly HashSet<string> NegativeKeywordsForCryptoArticles = new(StringComparer.OrdinalIgnoreCase)
  {
    "nba", "nfl", "mlb", "nhl", "fifa", "uefa", "espn", "sports", "sport", "athlete", "athletics",
    "basketball", "football", "baseball", "hockey", "soccer", "tennis", "golf", "cricket", "rugby",
    "olympics", "playoffs", "tournament", "championship", "match", "game", "player", "team", "coach",
    "referee", "stadium", "arena", "score", "win", "loss", "victory", "defeat", "draft", "transfer",
    "contract", "salary", "injury", "foul", "penalty", "goal", "assist", "mvp", "all-star", "final",

		// Entertainment & Celebrities
		"movie", "film", "actor", "actress", "hollywood", "oscar", "emmy", "grammy", "award", "celebrity",
    "tv", "television", "series", "netflix", "disney", "hbo", "amazon prime", "streaming", "youtube",
    "music", "song", "album", "artist", "band", "concert", "tour", "billboard", "spotify", "tiktok",
    "instagram", "social media", "influencer", "viral", "trending", "famous", "red carpet", "gossip",
    "rumor", "scandal", "divorce", "marriage", "engagement", "birth", "death", "obituary", "biography",

		// Politics & World News
		"politics", "politician", "election", "president", "prime minister", "congress", "senate", "parliament",
    "government", "law", "bill", "policy", "tax", "economy", "trade", "sanction", "embargo", "treaty",
    "war", "conflict", "military", "army", "navy", "air force", "nato", "un", "united nations", "who",
    "european union", "brexit", "immigration", "refugee", "border", "security", "terrorism", "cyberattack",
    "hacking", "espionage", "diplomacy", "summit", "meeting", "negotiation", "protest", "riot", "strike",
    "scandal", "corruption", "investigation", "court", "judge", "verdict", "trial", "lawsuit", "crime",
    "police", "arrest", "murder", "shooting",

		// General Non-Crypto News
		"weather", "forecast", "hurricane", "earthquake", "flood", "fire", "disaster", "accident", "crash",
    "plane", "airplane", "flight", "train", "car", "vehicle", "traffic", "road", "bridge", "construction",
    "health", "medical", "doctor", "hospital", "disease", "virus", "covid", "pandemic", "vaccine", "medicine",
    "science", "research", "study", "discovery", "invention", "space", "nasa", "rocket", "mars", "moon",
    "alien", "ufo", "technology", "ai", "artificial intelligence", "robot", "machine learning", "quantum",
    "gadget", "smartphone", "laptop", "computer", "software", "hardware", "internet", "website", "app",
    "business", "company", "startup", "merger", "acquisition", "ceo", "founder", "investor", "stock",
    "market", "finance", "bank", "loan", "mortgage", "interest", "inflation", "recession", "unemployment",
    "job", "hire", "layoff", "salary", "wage", "union", "strike", "protest", "consumer", "product", "brand",
    "advertising", "marketing", "sales", "retail", "amazon", "walmart", "tesla", "apple", "google", "meta",
    "microsoft", "netflix", "disney", "sony", "nintendo", "playstation", "xbox", "gaming", "esports", "twitch",

		// Miscellaneous
		"food", "restaurant", "recipe", "cooking", "chef", "meal", "diet", "nutrition", "fitness", "gym",
    "exercise", "weight", "muscle", "health", "wellness", "travel", "tourism", "vacation", "hotel", "flight",
    "airline", "destination", "beach", "mountain", "city", "country", "culture", "tradition", "festival",
    "holiday", "christmas", "new year", "easter", "halloween", "thanksgiving", "valentine", "birthday",
    "wedding", "anniversary", "party", "celebration", "event", "concert", "festival", "exhibition", "museum",
    "art", "painting", "sculpture", "photography", "design", "fashion", "clothing", "shoes", "jewelry",
  };
  private static readonly HashSet<string> CryptoKeywords = new(StringComparer.OrdinalIgnoreCase)
  {
    "bitcoin", "btc", "ethereum", "eth", "tether", "usdt", "xrp", "bnb", "solana", "sol", "cardano", "ada", "dogecoin", "doge",
    "polkadot", "dot", "litecoin", "ltc", "tron", "trx", "monero", "xmr", "avalanche", "avax", "stellar", "xlm", "vechain", "vet",
    "chainlink", "aptos",   "arbitrum", "arb", "optimism",   "rndr", "sui", "algorand", "algo",
    "coinbase", "binance", "kraken", "bitfinex", "gemini", "huobi", "okx", "bitstamp", "kucoin", "crypto.com", "bybit", "mexc",
    "bitmart", "upbit", "bittrex", "probit", "gate.io", "poloniex", "wallet", "cold wallet", "hot wallet", "hardware wallet",
    "metamask", "trust wallet", "private key", "public key", "day trading", "forex", "margin trading", "leverage",
    "long position", "short position", "stop loss", "take profit", "trading bot", "pump and dump",
    "candlestick", "bullish", "bearish", "market cap", "volume", "liquidity", "blockchain", "ledger", "smart contract",
    "gas fees", "layer 1", "layer 2", "sharding", "rollups", "zk-rollup", "optimistic rollup", "sidechain", "consensus",
    "proof of work", "proof of stake", "pos", "pow", "staking", "validator", "mining", "miner", "hashrate", "hashing",
    "hashpower", "nonce", "node", "fork", "hard fork", "soft fork", "altcoin", "stablecoin", "shitcoin", "memecoin",
    "uniswap", "pancakeswap", "sushiswap", "aave",  "makerdao", "yearn finance", "curve", "balancer", "1inch",
    "polygon", "matic", "fantom", "ftm", "hedera", "hbar", "nft", "non-fungible token", "openSea", "sei", "phantom",
    "tron", "digital art", "bored ape", "crypto punk", "metaverse", "sandbox", "decentraland", "web3",
    "virtual land", "play to earn", "p2e", "axie infinity", "immutable x", "gamefi", "ledger", "trezor", "multisig",
    "2fa", "rugpull", "airdrop", "kyc", "aml", "regulation", "sec", "defi", "dapp", "dao",
    "downtime",  "cross-chain",  "digital currency",  "fiat currency", "central bank digital currency", "cbdc", "etf", "spot etf",
    "securities", "futures", "derivatives", "treasury bonds", "cryptocurrency", "crypto",
    "shiba inu", "shib", "pepe", "pepecoin", "floki", "floki inu", "bonk", "dogelon mars", "safemoon", "hoge", "wojak",
    "wojak coin", "toshi", "base toshi", "turbo", "milady", "mog", "mog coin",
    "wif", "dogwifhat", "bome", "book of meme", "tate", "andrew tate coin", "troll", "troll coin", "boden", "tremp",
    "kishu inu", "kishu", "akita inu", "akita", "samoyedcoin", "samoyed", "babydoge", "baby doge", "smog", "smog token",
    "myro", "myro coin", "popcat", "popcat coin", "coq", "coq inu", "honk", "honk token", "slerf", "slerf coin", "pol", "pol coin",
    "meme", "meme coin", "fren", "fren coin", "anon", "anon coin", "chad", "chad coin", "viral", "viral coin", "degen", "degen coin",
    "kek", "kek coin", "cummies", "cummies token", "lambo", "lambo coin", "hodl", "hodl coin", "wagmi", "wagmi coin",
    "ngmi", "ngmi coin", "wen", "wen coin", "luna classic", "ustc", "terrausd classic",
    "scamcoin", "scam coin", "rug coin"
  };

  // Words that should cause an article to be skipped entirely when indexing/saving
  private static readonly string[] DirtyWords = new[] { "casino", "weight-loss", "free spins", "weightloss method", "diet method" };


  // Negative sentiment keywords (expanded for financial & crypto-related negative events)
  // These are matched using word-boundary regex to reduce substring false-positives.
  private static readonly string[] NegativeSentimentWords = new[]
  {
		// macro / economic
		"threats",
    "terrorist",
    "recession",
    "inflation",
    "tariff",
    "stagflation",
    "bear market",
    "crash",
    "bubble",
    "correction",
    "black swan",
    "falling knife",
    "downside",
    "volatility",
    "layoffs",
    "downsizing",
    "mismanagement",
    "debt",
    "debt default",
    "debt crisis",
    "sovereign default",
    "credit downgrade",
    "bankruptcy",
    "insolvency",
    "default",
    "liquidation",
    "margin call",
    "foreclosure",
    "bailout",
    "bail-in",
    "bank run",

		// market / trading
		"flash crash",
    "liquidations",
    "margin liquidation",
    "circuit breaker",
    "sell-off",
    "panic",

		// regulatory / legal / enforcement
		"regulation",
    "ban",
    "restriction",
    "delist",
    "delisting",
    "fine",
    "penalty",
    "sanction",
    "seizure",
    "freeze",
    "asset freeze",

		// crypto-specific negative events
		"hack",
    "exchange hack",
    "bridge hack",
    "exploit",
    "smart contract exploit",
    "rug pull",
    "exit scam",
    "fraud",
    "scam",
    "embezzlement",
    "money laundering",
    "aml",
    "kyc",
    "withdrawals halted",
    "withdrawal freeze",
    "outage",
    "downtime",
    "custody issue",
    "insolvency",
    "depeg",
    "stablecoin depeg",

		// general financial distress
		"crisis",
    "panic selling",
    "run on bank",
    "credit crunch",
    "default swap",
    "bailout",
    "interest rate hike",
    "rate hike",
    "quantitative easing",
    "quantitative tightening",
    "yield spike",
    "bond yield",
  };

  private static readonly SemaphoreSlim _loadLock = new SemaphoreSlim(1, 1);

  private static readonly Dictionary<string, (double Lat, double Lon)> NewsCountryCoords = new(StringComparer.OrdinalIgnoreCase)
  {
    ["united states"] = (37.09, -95.71),
    ["usa"] = (37.09, -95.71),
    ["us"] = (37.09, -95.71),
    ["united kingdom"] = (55.37, -3.43),
    ["uk"] = (55.37, -3.43),
    ["britain"] = (55.37, -3.43),
    ["canada"] = (56.13, -106.34),
    ["australia"] = (-25.27, 133.77),
    ["germany"] = (51.16, 10.45),
    ["france"] = (46.22, 2.21),
    ["japan"] = (36.20, 138.25),
    ["china"] = (35.86, 104.19),
    ["india"] = (20.59, 78.96),
    ["brazil"] = (-14.23, -51.92),
    ["russia"] = (61.52, 105.31),
    ["mexico"] = (23.63, -102.55),
    ["italy"] = (41.87, 12.56),
    ["spain"] = (40.46, -3.74),
    ["south korea"] = (35.90, 127.76),
    ["netherlands"] = (52.13, 5.29),
    ["sweden"] = (60.12, 18.64),
    ["norway"] = (60.47, 8.46),
    ["denmark"] = (56.26, 9.50),
    ["finland"] = (61.92, 25.74),
    ["poland"] = (51.91, 19.14),
    ["ukraine"] = (48.37, 31.16),
    ["turkey"] = (38.96, 35.24),
    ["saudi arabia"] = (23.88, 45.07),
    ["israel"] = (31.04, 34.85),
    ["egypt"] = (26.82, 30.80),
    ["south africa"] = (-30.55, 22.93),
    ["nigeria"] = (9.08, 8.67),
    ["kenya"] = (-0.02, 37.90),
    ["argentina"] = (-38.41, -63.61),
    ["chile"] = (-35.67, -71.54),
    ["colombia"] = (4.57, -74.29),
    ["pakistan"] = (30.37, 69.34),
    ["bangladesh"] = (23.68, 90.35),
    ["indonesia"] = (-0.78, 113.92),
    ["thailand"] = (15.87, 100.99),
    ["vietnam"] = (14.05, 108.27),
    ["philippines"] = (12.87, 121.77),
    ["malaysia"] = (4.21, 101.97),
    ["singapore"] = (1.35, 103.82),
    ["new zealand"] = (-40.90, 174.88),
    ["switzerland"] = (46.81, 8.22),
    ["austria"] = (47.51, 14.55),
    ["belgium"] = (50.50, 4.46),
    ["portugal"] = (39.39, -8.22),
    ["greece"] = (39.07, 21.82),
    ["czech republic"] = (49.81, 15.47),
    ["romania"] = (45.94, 24.96),
    ["hungary"] = (47.16, 19.50),
    ["ireland"] = (53.41, -8.24),
    ["iran"] = (32.42, 53.68),
    ["iraq"] = (33.22, 43.67),
    ["afghanistan"] = (33.93, 67.70),
    ["syria"] = (34.80, 39.00),
    ["yemen"] = (15.55, 48.52),
    ["libya"] = (26.34, 17.23),
    ["algeria"] = (28.03, 1.66),
    ["morocco"] = (31.79, -7.09),
    ["sudan"] = (12.86, 30.22),
    ["ethiopia"] = (9.15, 40.49),
    ["tanzania"] = (-6.37, 34.89),
    ["ghana"] = (7.95, -1.02),
    ["angola"] = (-11.20, 17.87),
    ["mozambique"] = (-18.67, 35.53),
    ["zimbabwe"] = (-19.02, 29.15),
    ["peru"] = (-9.19, -75.01),
    ["venezuela"] = (6.42, -66.59),
    ["cuba"] = (21.52, -77.78),
    ["north korea"] = (40.34, 127.51),
    ["taiwan"] = (23.70, 120.96),
    ["myanmar"] = (21.91, 95.96),
    ["nepal"] = (28.39, 84.12),
    ["sri lanka"] = (7.87, 80.77),
    ["kazakhstan"] = (48.02, 66.92),
    ["qatar"] = (25.35, 51.18),
    ["kuwait"] = (29.31, 47.48),
    ["oman"] = (21.51, 55.92),
    ["jordan"] = (30.58, 36.23),
    ["lebanon"] = (33.85, 35.86),
    ["palestine"] = (31.95, 35.23),
    ["united arab emirates"] = (23.42, 53.84),
    ["uae"] = (23.42, 53.84),
    ["bahrain"] = (26.03, 50.55),
    ["croatia"] = (45.10, 15.20),
    ["serbia"] = (44.02, 21.00),
    ["bulgaria"] = (42.73, 25.48),
    ["slovakia"] = (48.66, 19.69),
    ["slovenia"] = (46.15, 14.99),
    ["lithuania"] = (55.16, 23.88),
    ["latvia"] = (56.87, 25.60),
    ["estonia"] = (58.59, 25.01),
    ["iceland"] = (64.96, -19.02),
    ["luxembourg"] = (49.81, 6.13),
    ["monaco"] = (43.73, 7.42),
    ["vatican city"] = (41.90, 12.45),
  };

  private static readonly Dictionary<string, (double Lat, double Lon)> NewsCityCoords = new(StringComparer.OrdinalIgnoreCase)
  {
    ["new york"] = (40.7128, -74.0060),
    ["los angeles"] = (34.0522, -118.2437),
    ["chicago"] = (41.8781, -87.6298),
    ["london"] = (51.5074, -0.1278),
    ["paris"] = (48.8566, 2.3522),
    ["berlin"] = (52.5200, 13.4050),
    ["tokyo"] = (35.6762, 139.6503),
    ["sydney"] = (-33.8688, 151.2093),
    ["toronto"] = (43.6532, -79.3832),
    ["montreal"] = (45.5017, -73.5673),
    ["vancouver"] = (49.2827, -123.1207),
    ["ottawa"] = (45.4215, -75.6972),
    ["san francisco"] = (37.7749, -122.4194),
    ["seattle"] = (47.6062, -122.3321),
    ["miami"] = (25.7617, -80.1918),
    ["boston"] = (42.3601, -71.0589),
    ["dubai"] = (25.2048, 55.2708),
    ["hong kong"] = (22.3193, 114.1694),
    ["mumbai"] = (19.0760, 72.8777),
    ["delhi"] = (28.7041, 77.1025),
    ["são paulo"] = (-23.5505, -46.6333),
    ["rio de janeiro"] = (-22.9068, -43.1729),
    ["mexico city"] = (19.4326, -99.1332),
    ["buenos aires"] = (-34.6037, -58.3816),
    ["moscow"] = (55.7558, 37.6173),
    ["st petersburg"] = (59.9343, 30.3351),
    ["beijing"] = (39.9042, 116.4074),
    ["shanghai"] = (31.2304, 121.4737),
    ["shenzhen"] = (22.5431, 114.0579),
    ["guangzhou"] = (23.1291, 113.2644),
    ["seoul"] = (37.5665, 126.9780),
    ["bangkok"] = (13.7563, 100.5018),
    ["singapore city"] = (1.3521, 103.8198),
    ["kuala lumpur"] = (3.1390, 101.6869),
    ["jakarta"] = (-6.2088, 106.8456),
    ["manila"] = (14.5995, 120.9842),
    ["ho chi minh city"] = (10.8231, 106.6297),
    ["hanoi"] = (21.0278, 105.8342),
    ["dhaka"] = (23.8103, 90.4125),
    ["karachi"] = (24.8607, 67.0011),
    ["lahore"] = (31.5497, 74.3436),
    ["kolkata"] = (22.5726, 88.3639),
    ["bangalore"] = (12.9716, 77.5946),
    ["hyderabad"] = (17.3850, 78.4867),
    ["chennai"] = (13.0827, 80.2707),
    ["washington dc"] = (38.9072, -77.0369),
    ["washington"] = (38.9072, -77.0369),
    ["philadelphia"] = (39.9526, -75.1652),
    ["atlanta"] = (33.7490, -84.3880),
    ["dallas"] = (32.7767, -96.7970),
    ["houston"] = (29.7604, -95.3698),
    ["austin"] = (30.2672, -97.7431),
    ["denver"] = (39.7392, -104.9903),
    ["phoenix"] = (33.4484, -112.0740),
    ["las vegas"] = (36.1699, -115.1398),
    ["portland"] = (45.5152, -122.6784),
    ["san diego"] = (32.7157, -117.1611),
    ["minneapolis"] = (44.9778, -93.2650),
    ["detroit"] = (42.3314, -83.0458),
    ["nashville"] = (36.1627, -86.7816),
    ["new orleans"] = (29.9511, -90.0715),
    ["orlando"] = (28.5383, -81.3792),
    ["tampa"] = (27.9506, -82.4572),
    ["san jose"] = (37.3382, -121.8863),
    ["sacramento"] = (38.5816, -121.4944),
    ["kansas city"] = (39.0997, -94.5786),
    ["columbus"] = (39.9612, -82.9988),
    ["indianapolis"] = (39.7684, -86.1581),
    ["charlotte"] = (35.2271, -80.8431),
    ["milwaukee"] = (43.0389, -87.9065),
    ["baltimore"] = (39.2904, -76.6122),
    ["memphis"] = (35.1495, -90.0490),
    ["fort worth"] = (32.7555, -97.3308),
    ["el paso"] = (31.7619, -106.4850),
    ["nashville"] = (36.1627, -86.7816),
    ["jerusalem"] = (31.7683, 35.2137),
    ["tel aviv"] = (32.0853, 34.7818),
    ["riyadh"] = (24.7136, 46.6753),
    ["doha"] = (25.2854, 51.5310),
    ["muscat"] = (23.5880, 58.3829),
    ["ankara"] = (39.9334, 32.8597),
    ["istanbul"] = (41.0082, 28.9784),
    ["cairo"] = (30.0444, 31.2357),
    ["alexandria"] = (31.2001, 29.9187),
    ["casablanca"] = (33.5731, -7.5898),
    ["rabat"] = (34.0209, -6.8416),
    ["tunis"] = (36.8065, 10.1815),
    ["nairobi"] = (-1.2921, 36.8219),
    ["lagos"] = (6.5244, 3.3792),
    ["cape town"] = (-33.9249, 18.4241),
    ["johannesburg"] = (-26.2041, 28.0473),
    ["durban"] = (-29.8587, 31.0218),
    ["addis ababa"] = (9.0320, 38.7469),
    ["acra"] = (5.6037, -0.1870),
    ["dakar"] = (14.7167, -17.4676),
    ["stockholm"] = (59.3293, 18.0686),
    ["oslo"] = (59.9139, 10.7522),
    ["copenhagen"] = (55.6761, 12.5683),
    ["helsinki"] = (60.1699, 24.9384),
    ["warsaw"] = (52.2297, 21.0122),
    ["prague"] = (50.0755, 14.4378),
    ["budapest"] = (47.4979, 19.0402),
    ["vienna"] = (48.2082, 16.3738),
    ["zurich"] = (47.3769, 8.5417),
    ["geneva"] = (46.2044, 6.1432),
    ["brussels"] = (50.8503, 4.3517),
    ["amsterdam"] = (52.3676, 4.9041),
    ["rotterdam"] = (51.9244, 4.4777),
    ["madrid"] = (40.4168, -3.7038),
    ["barcelona"] = (41.3874, 2.1686),
    ["lisbon"] = (38.7223, -9.1393),
    ["rome"] = (41.9028, 12.4964),
    ["milan"] = (45.4642, 9.1900),
    ["naples"] = (40.8518, 14.2681),
    ["venice"] = (45.4408, 12.3155),
    ["dublin"] = (53.3498, -6.2603),
    ["edinburgh"] = (55.9533, -3.1883),
    ["glasgow"] = (55.8642, -4.2518),
    ["manchester"] = (53.4808, -2.2426),
    ["birmingham"] = (52.4862, -1.8904),
    ["liverpool"] = (53.4084, -2.9916),
    ["kiev"] = (50.4501, 30.5234),
    ["kyiv"] = (50.4501, 30.5234),
    ["odessa"] = (46.4843, 30.7326),
    ["minsk"] = (53.9045, 27.5615),
    ["bucharest"] = (44.4268, 26.1025),
    ["sofia"] = (42.6977, 23.3219),
    ["belgrade"] = (44.7866, 20.4489),
    ["zagreb"] = (45.8150, 15.9819),
    ["athens"] = (37.9838, 23.7275),
    ["tehran"] = (35.6892, 51.3890),
    ["baghdad"] = (33.3152, 44.3661),
    ["kabul"] = (34.5553, 69.2075),
    ["islamabad"] = (33.6844, 73.0479),
    ["copenhagen"] = (55.6761, 12.5683),
    ["perth"] = (-31.9505, 115.8605),
    ["melbourne"] = (-37.8136, 144.9631),
    ["brisbane"] = (-27.4698, 153.0251),
    ["auckland"] = (-36.8485, 174.7633),
    ["wellington"] = (-41.2865, 174.7762),
    ["hamburg"] = (53.5511, 9.9937),
    ["munich"] = (48.1351, 11.5820),
    ["frankfurt"] = (50.1109, 8.6821),
    ["cologne"] = (50.9375, 6.9603),
    ["stuttgart"] = (48.7758, 9.1829),
    ["lyon"] = (45.7640, 4.8357),
    ["marseille"] = (43.2965, 5.3698),
    ["nice"] = (43.7102, 7.2620),
    ["osaka"] = (34.6937, 135.5023),
    ["kyoto"] = (35.0116, 135.7681),
    ["nagoya"] = (35.1815, 136.9066),
    ["fukuoka"] = (33.5904, 130.4017),
    ["sapporo"] = (43.0618, 141.3545),
    ["guangzhou"] = (23.1291, 113.2644),
    ["chengdu"] = (30.5728, 104.0668),
    ["wuhan"] = (30.5928, 114.3055),
    ["nanjing"] = (32.0603, 118.7969),
    ["hangzhou"] = (30.2741, 120.1551),
    ["busan"] = (35.1796, 129.0756),
    ["incheon"] = (37.4563, 126.7052),
    ["kolkata"] = (22.5726, 88.3639),
    ["mumbai"] = (19.0760, 72.8777),
    ["medellin"] = (6.2476, -75.5658),
    ["bogota"] = (4.7110, -74.0721),
    ["lima"] = (-12.0464, -77.0428),
    ["santiago"] = (-33.4489, -70.6693),
    ["caracas"] = (10.4806, -66.9036),
    ["baku"] = (40.4093, 49.8671),
    ["tbilisi"] = (41.7151, 44.8271),
    ["yerevan"] = (40.1792, 44.4991),
    ["tashkent"] = (41.2995, 69.2401),
    ["almaty"] = (43.2220, 76.8512),
    ["montevideo"] = (-34.9011, -56.1645),
    ["asuncion"] = (-25.2637, -57.5759),
    ["la paz"] = (-16.5000, -68.1500),
  };

  private readonly NewsHttpClient _newsHttp;
  private readonly WebCrawler _crawler;
  public NewsService(IConfiguration config, Log log, NewsHttpClient newsHttp, WebCrawler webCrawler)
  {
    _config = config;
    _log = log;
    _newsHttp = newsHttp;
    _crawler = webCrawler;
  }
  public async Task<ArticlesResult?> GetTopHeadlines(string? keywords)
  {
    try
    {
      var articlesResponse = await _newsHttp.GetTopHeadlinesAsync(keywords, "en");
      if (articlesResponse != null && string.Equals(articlesResponse.Status, "ok", StringComparison.OrdinalIgnoreCase))
      {
        // Map DTO ArticlesResult to the NewsApi-like ArticlesResult used elsewhere
        return new ArticlesResult
        {
          Status = "ok",
          TotalResults = articlesResponse.TotalResults,
          Articles = articlesResponse.Articles?.Select(a => new Article
          {
            Title = a.Title,
            Description = a.Description,
            Url = a.Url,
            PublishedAt = a.PublishedAt,
            UrlToImage = a.UrlToImage,
            Content = a.Content,
            Author = a.Author
          }).ToList() ?? new List<Article>()
        };
      }
    }
    catch (Exception ex)
    {
      _ = _log.Db("Exception GetTopHeadlines: " + ex.Message, null, "NEWSSERVICE", outputToConsole: true);
      return null;
    }
    return null;
  }
  public async Task<List<maxhanna.Server.Controllers.DataContracts.News.Article>?> GetAndSaveTopQuarterHourlyHeadlines(string? keyword)
  {
    const int articlesToTake = 60;
    try
    {
      using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();

      // Check if any news have been saved in the past 15 minutes
      string checkSql = "SELECT COUNT(*) FROM news_headlines WHERE saved_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE);";
      using (var checkCmd = new MySqlCommand(checkSql, conn))
      {
        var count = Convert.ToInt32(await checkCmd.ExecuteScalarAsync());
        if (count > 0)
        {
          await _log.Db("Already fetched recent news headlines. Waiting for the next interval.", null, "NEWSSERVICE", true);
          return null;
        }
      }

      var articlesResult = await GetTopHeadlines(keyword);

      if (articlesResult?.Status != NewsStatuses.Ok || articlesResult.Articles == null)
      {
        await _log.Db("Failed to fetch top headlines", null, "NEWSSERVICE", outputToConsole: true);
        return null;
      }

      var top60 = articlesResult.Articles.Take(articlesToTake).ToList();
      int successfullyInsertedCount = 0;

      using var transaction = await conn.BeginTransactionAsync();

      successfullyInsertedCount = await IndexAndInsertArticles(top60, conn, transaction);

      await transaction.CommitAsync();

      if (successfullyInsertedCount > 0)
      {
        await _log.Db($"Successfully saved {successfullyInsertedCount}/{articlesToTake} headlines{(keyword != null ? $" (keyword: {keyword})" : "")}",
               null, "NEWSSERVICE", outputToConsole: true);

        // After saving articles, compute negative-word sentiment count across the fresh articles
        try
        {
          // Compute per-article negative counts and collect IDs for articles that contributed
          int totalNegativeCount = 0;
          var contributingArticleIds = new List<int>();
          foreach (var article in top60)
          {
            int perCount = CountNegativeWordsInArticle(article);
            totalNegativeCount += perCount;
            if (perCount > 0)
            {
              // Look up the article id in the DB (should exist after commit)
              using var idCmd = new MySqlCommand("SELECT id FROM news_headlines WHERE url = @url LIMIT 1", conn);
              idCmd.Parameters.AddWithValue("@url", article.Url ?? "");
              var idObj = await idCmd.ExecuteScalarAsync();
              if (idObj != null && int.TryParse(idObj.ToString(), out var aid)) contributingArticleIds.Add(aid);
            }
          }
          await SaveSentimentCountAsync(conn, totalNegativeCount, contributingArticleIds);
        }
        catch (Exception ex)
        {
          await _log.Db("Failed to save sentiment score: " + ex.Message, null, "NEWSSERVICE", outputToConsole: true);
        }

        // Extract locations and create news pins
        try
        {
          await ExtractAndSaveNewsPins(top60);
        }
        catch (Exception ex)
        {
          await _log.Db("Failed to extract and save news pins: " + ex.Message, null, "NEWSSERVICE", outputToConsole: true);
        }

        return articlesResult.Articles;
      }

      return articlesResult.Articles;
    }
    catch (Exception ex)
    {
      await _log.Db($"Critical error in GetAndSaveTopHeadlines: {ex.Message}", null, "NEWSSERVICE", outputToConsole: true);
      return null;
    }
  }

  /// <summary>
  /// Indexes and inserts a list of articles into the `news_headlines` table, skipping articles
  /// that match any word in the DirtyWords list.
  /// Returns the number of rows inserted.
  /// </summary>
  private async Task<int> IndexAndInsertArticles(List<Article> articles, MySqlConnection conn, MySqlTransaction transaction)
  {
    if (articles == null || articles.Count == 0) return 0;
    int inserted = 0;
    foreach (var article in articles)
    {
      try
      {
        if (ArticleContainsDirtyWord(article))
        {
          await _log.Db($"Skipping article due to dirty word: {article.Title ?? article.Url}", null, "NEWSSERVICE", outputToConsole: true);
          continue;
        }

        string sql = @"
						INSERT IGNORE INTO news_headlines 
						(title, description, url, published_at, saved_at, url_to_image, content, author)
						VALUES (@title, @description, @url, @published_at, UTC_TIMESTAMP(), @url_to_image, @content, @author);";

        using var cmd = new MySqlCommand(sql, conn, transaction);
        cmd.Parameters.AddWithValue("@title", article.Title ?? "");
        cmd.Parameters.AddWithValue("@description", article.Description ?? "");
        cmd.Parameters.AddWithValue("@url", article.Url ?? "");
        cmd.Parameters.AddWithValue("@published_at", article.PublishedAt ?? DateTime.UtcNow);
        cmd.Parameters.AddWithValue("@url_to_image", article.UrlToImage ?? "");
        cmd.Parameters.AddWithValue("@content", article.Content ?? "");
        cmd.Parameters.AddWithValue("@author", article.Author ?? "");

        int rowsAffected = await cmd.ExecuteNonQueryAsync();
        if (rowsAffected > 0) inserted++;
      }
      catch (Exception ex)
      {
        await _log.Db($"Failed to insert article (Title: {article.Title?.Substring(0, Math.Min(20, article.Title.Length))}...): {ex.Message}", null, "NEWSSERVICE", outputToConsole: true);
        continue;
      }
    }
    return inserted;
  }

  private bool ArticleContainsDirtyWord(Article article)
  {
    if (article == null) return false;
    string[] fields = new[] { article.Title ?? "", article.Description ?? "" };
    foreach (var dirty in DirtyWords)
    {
      if (string.IsNullOrWhiteSpace(dirty))
      {
        continue;
      }
      var pattern = "\\b" + Regex.Escape(dirty) + "\\b";
      foreach (var f in fields)
      {
        if (!string.IsNullOrEmpty(f) && Regex.IsMatch(f, pattern, RegexOptions.IgnoreCase))
        {
          return true;
        }
      }
    }
    return false;
  }

  public async Task<ArticlesResult> GetArticlesFromDb(string? keywords = null, int? hours = null, int page = 1, int pageSize = 50)
  {
    var result = new ArticlesResult
    {
      Status = NewsStatuses.Ok,
      Articles = new List<Article>()
    };

    try
    {
      using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();

      // Base SQL query with SQL_CALC_FOUND_ROWS
      var sql = new System.Text.StringBuilder(@"
            SELECT SQL_CALC_FOUND_ROWS 
                title, description, url, published_at, url_to_image, author, content, saved_at
            FROM news_headlines
            WHERE 1=1");

      using var cmd = new MySqlCommand("", conn);

      // Add keyword conditions if keywords are provided
      if (!string.IsNullOrWhiteSpace(keywords))
      {
        var searchTerms = keywords.Split(',')
          .Select(k => k.Trim())
          .Where(k => !string.IsNullOrEmpty(k))
          .ToList();

        if (searchTerms.Any())
        {
          var keywordConditions = new List<string>();
          for (int i = 0; i < searchTerms.Count; i++)
          {
            keywordConditions.Add($@"
                        (title LIKE CONCAT('%', @term{i}, '%')
                         OR description LIKE CONCAT('%', @term{i}, '%') 
                         OR content LIKE CONCAT('%', @term{i}, '%')
                         OR author LIKE CONCAT('%', @term{i}, '%')
                        )");
            cmd.Parameters.AddWithValue($"@term{i}", searchTerms[i]);
          }
          sql.Append(" AND (").Append(string.Join(" OR ", keywordConditions)).Append(")");
        }
      }

      // Add time filter if hours parameter has a value
      if (hours.HasValue)
      {
        sql.Append(" AND saved_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL @hours HOUR)");
        cmd.Parameters.AddWithValue("@hours", hours.Value);
      }

      // Add pagination
      sql.Append($" ORDER BY saved_at DESC LIMIT {pageSize} OFFSET {(page - 1) * pageSize};");

      // Set the final command text
      cmd.CommandText = sql.ToString();

      // Execute the main query
      using var reader = await cmd.ExecuteReaderAsync();

      while (await reader.ReadAsync())
      {
        result.Articles.Add(new Article
        {
          Title = reader["title"]?.ToString(),
          Description = reader["description"]?.ToString(),
          Url = reader["url"]?.ToString(),
          PublishedAt = reader["published_at"] as DateTime?,
          Source = new ApiSource
          {
            Id = "local-db",
            Name = reader["url"]?.ToString() ?? reader["author"]?.ToString(),
          },
          Author = reader["author"]?.ToString(),
          Content = reader["content"]?.ToString(),
          UrlToImage = reader["url_to_image"]?.ToString(),
        });
      }

      // Close the reader to allow the next query on the same connection
      await reader.CloseAsync();

      // Get total count using FOUND_ROWS()
      cmd.CommandText = "SELECT FOUND_ROWS() as total;";
      result.TotalResults = Convert.ToInt32(await cmd.ExecuteScalarAsync());
    }
    catch (Exception ex)
    {
      await _log.Db($"Exception in GetArticlesFromDb (keywords: {keywords}, hours: {hours}): {ex.Message}", null, "NEWSSERVICE", outputToConsole: true);
      result.Status = NewsStatuses.Error;
      result.Error = new Error
      {
        Code = "UnexpectedError",
        Message = ex.Message
      };
    }

    return result;
  }
  public async Task CreateDailyNewsStoryAsync()
  {
    if (!await _loadLock.WaitAsync(0))
    {
      _ = _log.Db("Attempting to CreateDailyNewsStoryAsync while loadLock active. News post Cancelled.", null, "NEWSSERVICE", outputToConsole: true);
      return;
    }

    try
    {
      await CreateDailyMusicStoryAsync();
      await CreateDailyCryptoNewsStoryAsync();
      await PostDailyMemeAsync();
      try
      {
        // Fast pre-check: verify we have at least 20 recent articles (last 24h)
        if (!await HasAtleast20NewsArticlesIn24HrsAsync())
        {
          return;
        }

        var topArticlesResult = await GetArticlesFromDb(null, 24);
        if (topArticlesResult?.Articles == null || topArticlesResult.Articles.Count == 0)
        {
          return;
        }
        List<Article>? tmpArticles = null;
        foreach (var article in topArticlesResult.Articles)
        {
          if ((article.Title ?? "").Contains("Cryptocurrency Stock"))
          {
            continue;
          }
          else
          {
            if (tmpArticles == null)
            {
              tmpArticles = new List<Article>();
            }
            tmpArticles.Add(article);
          }
        }
        topArticlesResult.Articles = tmpArticles;

        await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
        await conn.OpenAsync();
        await using var transaction = await conn.BeginTransactionAsync();

        // Check if a social story already exists for today (user_id = 0, contains marker text)
        string marker = "📰 [b]Daily News Update![/b]";
        string checkSql = $@"
              SELECT COUNT(*) FROM stories
              WHERE user_id = {newsServiceAccountNo} AND DATE(`date`) = CURDATE();";

        if (await CheckIfDailyNewsStoryAlreadyExists(conn, transaction, checkSql))
        {
          await _log.Db("Daily news story already exists. Skipping creation.", null, "NEWSSERVICE", outputToConsole: true);
          return;
        }

        // Build the story text and tokenize the descriptions of top articles
        var sb = new StringBuilder();
        sb.AppendLine(marker);

        List<(Article Article, List<string> Tokens)> articleTokenMap;
        string mostFrequentWord = GetMostFrequentWord(topArticlesResult, out articleTokenMap);
        await _log.Db($"Most frequent token from today's articles: '{mostFrequentWord}'", null, "NEWSSERVICE", outputToConsole: true);

        // Find the article where that word appears the most
        Article? selectedArticle = null;
        int maxOccurrences = 0;

        foreach (var (article, tokens) in articleTokenMap)
        {
          int occurrences = tokens.Count(t => t.Equals(mostFrequentWord, StringComparison.OrdinalIgnoreCase));
          await _log.Db($"Token '{mostFrequentWord}' found {occurrences} times in article: {article.Title}", null, "NEWSSERVICE", outputToConsole: true);

          if (occurrences > maxOccurrences)
          {
            maxOccurrences = occurrences;
            selectedArticle = article;
          }
        }

        if (selectedArticle == null)
        {
          await _log.Db("Error in CreateDailyNewsStoryAsync: No news article selected.", null, "NEWSSERVICE", outputToConsole: true);
          return;
        }

        // Build the story string using only the most relevant article 
        sb.AppendLine($"[*][b]{selectedArticle.Title}[/b]\nRead more: {selectedArticle.Url} [/*]");
        string fullStoryText = sb.ToString().Trim();

        // Save the description tokens of selected article for file-matching
        var selectedArticleTokens = TokenizeText(selectedArticle?.Description ?? string.Empty);
        // Insert the story into the 'stories' table (for the news service account)
        await CreateNewsPosts(conn, transaction, fullStoryText, selectedArticleTokens, newsServiceAccountNo);
        await _log.Db("Daily news story created successfully on both service account and user profile.", null, "NEWSSERVICE", outputToConsole: true);
      }
      catch (Exception ex)
      {
        await _log.Db("Error in CreateDailyNewsStoryAsync: " + ex.Message, null, "NEWSSERVICE", outputToConsole: true);
      }
    }
    catch (Exception e)
    {
      _ = _log.Db("Error acquiring load lock in CreateDailyNewsStoryAsync: " + e.Message, null, "NEWSSERVICE", outputToConsole: true);
    }
    finally
    {
      _loadLock.Release();
    }
  }

  private async Task CreateNewsPosts(MySqlConnection conn, MySqlTransaction transaction, string fullStoryText, List<string> selectedArticleTokens, int accountId)
  {
    string getLastStoryIdSql = "SELECT LAST_INSERT_ID();";
    // Now, find the best matching file from the `file_uploads` table
    int? bestFileMatch = await FindBestMatchingFileAsync(selectedArticleTokens, conn, transaction);
    string insertStoryFileSql = @"
                INSERT INTO story_files (story_id, file_id)
                VALUES (@storyId, @fileId);

				INSERT INTO story_topics (story_id, topic_id) VALUES (@storyId, (SELECT id FROM maxhanna.topics WHERE topic = 'News'));
            ";
    if (accountId == cryptoNewsServiceAccountNo)
    {
      insertStoryFileSql += " INSERT INTO story_topics (story_id, topic_id) VALUES (@storyId, (SELECT id FROM maxhanna.topics WHERE topic = 'Crypto'));";
    }

    // POST THE SAME STORY TO NEWS USER PROFILE
    string insertUserProfileSql = @"
            INSERT INTO stories (user_id, story_text, profile_user_id, city, country, date)
            VALUES (@userId, @storyText, @profileUserId, NULL, NULL, UTC_TIMESTAMP());
        ";

    await using var userProfileCmd = new MySqlCommand(insertUserProfileSql, conn, transaction);
    userProfileCmd.Parameters.AddWithValue("@userId", accountId);
    userProfileCmd.Parameters.AddWithValue("@storyText", fullStoryText);
    userProfileCmd.Parameters.AddWithValue("@profileUserId", accountId); // Assuming you have newsUserId defined
    await userProfileCmd.ExecuteNonQueryAsync();

    // Get the last inserted story ID for user profile
    int userProfileStoryId = Convert.ToInt32(await new MySqlCommand(getLastStoryIdSql, conn, transaction).ExecuteScalarAsync());

    if (bestFileMatch != null)
    {
      // Link the same file to the user profile story
      await using var userProfileFileCmd = new MySqlCommand(insertStoryFileSql, conn, transaction);
      userProfileFileCmd.Parameters.AddWithValue("@storyId", userProfileStoryId);
      userProfileFileCmd.Parameters.AddWithValue("@fileId", bestFileMatch.Value);
      await userProfileFileCmd.ExecuteNonQueryAsync();
    }

    await transaction.CommitAsync();
  }

  public async Task PostDailyMemeAsync()
  {
    try
    {
      using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();
      using var transaction = await conn.BeginTransactionAsync();

      // Check if we already posted a meme today
      if (await HasPostedMemeTodayAsync(conn, transaction))
      {
        await _log.Db("Already posted a meme today. Skipping.", null, "MEMESERVICE", outputToConsole: true);
        await transaction.RollbackAsync();
        return;
      }

      // Get today's most popular meme
      var topMeme = await GetMostPopularMemeTodayAsync(conn, transaction);

      if (topMeme == null)
      {
        await _log.Db("No memes uploaded today to post.", null, "MEMESERVICE", outputToConsole: true);
        await transaction.RollbackAsync();
        return;
      }

      // Create the story text
      var storyText = $@"📢 [b]Top Daily Meme![/b]
<a href='https://bughosted.com/Memes/{topMeme.Id}'>https://bughosted.com/Memes/{topMeme.Id}</a>
Posted by user @{topMeme.Username}<br><small>Daily top memes are selected based on highest number of comments and reactions.</small>";

      // Insert the story
      await InsertMemeStoryAsync(conn, transaction, storyText, topMeme.Id, memeServiceAccountNo);
      //await InsertMemeStoryAsync(conn, transaction, storyText, topMeme.Id, null);

      await transaction.CommitAsync();
      await _log.Db($"Successfully posted daily meme: {topMeme.FileName}", null, "MEMESERVICE", outputToConsole: true);
    }
    catch (Exception ex)
    {
      await _log.Db($"Error in PostDailyMemeAsync: {ex.Message}", null, "MEMESERVICE", outputToConsole: true);
    }
  }
  public async Task CreateDailyMusicStoryAsync()
  {
    try
    {
      using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();
      using var transaction = await conn.BeginTransactionAsync();

      // Check if we already posted today's music
      if (await HasPostedMusicTodayAsync(conn, transaction))
      {
        await _log.Db("Already posted daily music today. Skipping.", null, "MUSICSERVICE", outputToConsole: true);
        await transaction.RollbackAsync();
        return;
      }

      // Fetch today's music todos
      string sql = @"
 SELECT t.id, t.todo, t.url, t.file_id, t.ownership, u.username
 FROM todo t
 LEFT JOIN users u ON u.id = t.ownership
 WHERE t.type = 'music' 
 AND t.date >= UTC_TIMESTAMP() - IINTERVAL 1 DAY
 ORDER BY t.date DESC;";

      using var cmd = new MySqlCommand(sql, conn, transaction);
      using var rdr = await cmd.ExecuteReaderAsync();
      var todos = new List<(int Id, string? Title, string? Url, int? FileId, int? UserId, string? Username)>();
      while (await rdr.ReadAsync())
      {
        var id = rdr.IsDBNull(rdr.GetOrdinal("id")) ? 0 : rdr.GetInt32("id");
        var title = rdr.IsDBNull(rdr.GetOrdinal("todo")) ? null : rdr.GetString("todo");
        var url = rdr.IsDBNull(rdr.GetOrdinal("url")) ? null : rdr.GetString("url");
        int? fileId = rdr.IsDBNull(rdr.GetOrdinal("file_id")) ? (int?)null : rdr.GetInt32("file_id");
        int? userId = rdr.IsDBNull(rdr.GetOrdinal("ownership")) ? (int?)null : rdr.GetInt32("ownership");
        string? username = rdr.IsDBNull(rdr.GetOrdinal("username")) ? null : rdr.GetString("username");
        todos.Add((id, title, url, fileId, userId, username));
      }
      await rdr.CloseAsync();

      if (todos.Count == 0)
      {
        await _log.Db("No songs added today to post.", null, "MUSICSERVICE", outputToConsole: true);
        await transaction.RollbackAsync();
        return;
      }

      // Build story text with duplicate filtering
      var sb = new StringBuilder();
      var seenTitles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
      string marker = "🎵 [b]Daily Music Picks![/b]";
      sb.AppendLine(marker);
      foreach (var t in todos)
      {
        // Skip if title is null or already added
        if (string.IsNullOrWhiteSpace(t.Title) || seenTitles.Contains(t.Title))
          continue;

        seenTitles.Add(t.Title);

        // Link to internal todo item if possible, otherwise raw url
        string link = t.Url ?? "";
        sb.AppendLine($"[*][b]{WebUtility.HtmlEncode(t.Title ?? "Untitled")}[/b] {link} [/*]");
      }
      string fullStoryText = sb.ToString().Trim();

      // Attach first file if present
      int? firstFileId = todos.FirstOrDefault(t => t.FileId != null).FileId;

      // Collect URLs from todos to attempt metadata scraping
      var urls = todos.Where(t => !string.IsNullOrWhiteSpace(t.Url)).Select(t => t.Url!).ToArray();

      // Insert the story for the service account and user profile (if desired)
      await InsertMusicStoryAsync(conn, transaction, fullStoryText, firstFileId, musicServiceAccountNo, urls);
      // await InsertMusicStoryAsync(conn, transaction, fullStoryText, firstFileId, null, urls);

      await transaction.CommitAsync();
      await _log.Db($"Successfully posted daily music with {todos.Count} entries.", null, "MUSICSERVICE", outputToConsole: true);
    }
    catch (Exception ex)
    {
      await _log.Db($"Error in PostDailyMusicAsync: {ex.Message}", null, "MUSICSERVICE", outputToConsole: true);
    }
  }

  private async Task<bool> HasPostedMusicTodayAsync(MySqlConnection conn, MySqlTransaction transaction)
  {
    const string sql = @"
			SELECT COUNT(*) FROM stories
			WHERE user_id = @userId
			AND DATE(date) = CURDATE()
			AND story_text LIKE '%Daily Music Picks!%';";

    using var cmd = new MySqlCommand(sql, conn, transaction);
    cmd.Parameters.AddWithValue("@userId", musicServiceAccountNo);
    var exists = Convert.ToInt32(await cmd.ExecuteScalarAsync()) > 0;
    if (exists)
    {
      await _log.Db("Daily music story already exists. Skipping.", null, "MUSICSERVICE", outputToConsole: true);
      await transaction.RollbackAsync();
      return true;
    }
    return false;
  }

  private async Task InsertMusicStoryAsync(MySqlConnection conn, MySqlTransaction transaction, string storyText, int? fileId, int? profileUserId, string[]? urls = null)
  {
    // Insert the main story
    const string insertStorySql = @"
			INSERT INTO stories (user_id, story_text, profile_user_id, city, country, date)
			VALUES (@userId, @storyText, @profileUserId, NULL, NULL, UTC_TIMESTAMP());
			SELECT LAST_INSERT_ID();";

    using var storyCmd = new MySqlCommand(insertStorySql, conn, transaction);
    storyCmd.Parameters.AddWithValue("@userId", musicServiceAccountNo);
    storyCmd.Parameters.AddWithValue("@storyText", storyText);
    storyCmd.Parameters.AddWithValue("@profileUserId", profileUserId ?? (object)DBNull.Value);

    var storyId = Convert.ToInt32(await storyCmd.ExecuteScalarAsync());

    // Link file if provided
    if (fileId != null)
    {
      const string insertStoryFileSql = @"
			INSERT INTO story_files (story_id, file_id)
			VALUES (@storyId, @fileId);
			INSERT INTO story_topics (story_id, topic_id) VALUES (@storyId, (SELECT id FROM topics WHERE topic = 'Music'));
			";

      using var fileCmd = new MySqlCommand(insertStoryFileSql, conn, transaction);
      fileCmd.Parameters.AddWithValue("@storyId", storyId);
      fileCmd.Parameters.AddWithValue("@fileId", fileId.Value);
      await fileCmd.ExecuteNonQueryAsync();
    }
    else
    {
      // Still tag topic as Music
      using var topicCmd = new MySqlCommand("INSERT INTO story_topics (story_id, topic_id) VALUES (@storyId, (SELECT id FROM topics WHERE topic = 'Music'))", conn, transaction);
      topicCmd.Parameters.AddWithValue("@storyId", storyId);
      await topicCmd.ExecuteNonQueryAsync();
    }
    // If urls are provided, attempt to fetch metadata for each and insert into story_metadata
    if (urls != null && urls.Length > 0)
    {
      foreach (var url in urls)
      {
        try
        {
          var metadata = await _crawler.ScrapeUrlData(url);
          if (metadata != null)
          {
            await InsertMetadata(storyId, metadata);
          }
        }
        catch (Exception ex)
        {
          await _log.Db($"Failed to fetch/insert metadata for url {url}: {ex.Message}", null, "NEWSSERVICE", outputToConsole: true);
        }
      }
    }
  }

  private async Task<string> InsertMetadata(int storyId, Metadata? metadata)
  {
    if (metadata == null) return "No metadata to insert";
    string sql = @"INSERT INTO story_metadata (story_id, title, description, image_url, metadata_url) VALUES (@storyId, @title, @description, @imageUrl, @metadataUrl);";
    try
    {
      using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
      {
        await conn.OpenAsync();

        using (var cmd = new MySqlCommand(sql, conn))
        {
          cmd.Parameters.AddWithValue("@storyId", storyId);
          cmd.Parameters.AddWithValue("@title", HttpUtility.HtmlDecode(metadata.Title ?? ""));
          cmd.Parameters.AddWithValue("@description", HttpUtility.HtmlDecode(metadata.Description ?? ""));
          cmd.Parameters.AddWithValue("@imageUrl", metadata.ImageUrl ?? "");
          cmd.Parameters.AddWithValue("@metadataUrl", metadata.Url ?? "");

          await cmd.ExecuteNonQueryAsync();
        }
      }
    }
    catch
    {
      return "Could not insert metadata";
    }
    return "Inserted metadata";
  }

  private async Task<bool> HasPostedMemeTodayAsync(MySqlConnection conn, MySqlTransaction transaction)
  {
    const string sql = @"
            SELECT COUNT(*) FROM stories 
            WHERE user_id = @userId 
            AND DATE(date) = CURDATE() 
            AND story_text LIKE '%Daily Meme!%'";

    using var cmd = new MySqlCommand(sql, conn, transaction);
    cmd.Parameters.AddWithValue("@userId", memeServiceAccountNo);
    return (long?)await cmd.ExecuteScalarAsync() > 0;
  }

  private async Task<MemeInfo?> GetMostPopularMemeTodayAsync(MySqlConnection conn, MySqlTransaction transaction)
  {
    const string sql = @"
        SELECT 
            fu.id,
            fu.file_name,
            fu.given_file_name,
            fu.user_id,
            fuu.username,
            COUNT(DISTINCT c.id) AS comment_count,
            COUNT(DISTINCT r.id) AS reaction_count
        FROM file_uploads fu
        LEFT JOIN users fuu ON fuu.id = fu.user_id
        LEFT JOIN comments c ON c.file_id = fu.id
        LEFT JOIN reactions r ON r.file_id = fu.id
        WHERE 
            fu.folder_path = @folderPath 
            AND fu.is_folder = 0 
            AND fu.is_public = 1
            AND fu.id NOT IN (
                SELECT sf.file_id 
                FROM story_files sf
                JOIN stories s ON s.id = sf.story_id
                WHERE s.user_id = @serviceAccountId
                ORDER BY s.date DESC 
            )
        GROUP BY fu.id, fu.file_name, fu.given_file_name, fu.user_id, fuu.username
        HAVING (COUNT(DISTINCT c.id) + COUNT(DISTINCT r.id)) > 0
        ORDER BY fu.upload_date DESC, (COUNT(DISTINCT c.id) + COUNT(DISTINCT r.id)) DESC
        LIMIT 1";

    using var cmd = new MySqlCommand(sql, conn, transaction);
    cmd.Parameters.AddWithValue("@folderPath", MemeFolderPath);
    cmd.Parameters.AddWithValue("@serviceAccountId", memeServiceAccountNo);

    using var reader = await cmd.ExecuteReaderAsync();
    if (await reader.ReadAsync())
    {
      return new MemeInfo
      {
        Id = reader.GetInt32(reader.GetOrdinal("id")),
        FileName = reader.IsDBNull(reader.GetOrdinal("file_name")) ? null : reader.GetString(reader.GetOrdinal("file_name")),
        GivenFileName = reader.IsDBNull(reader.GetOrdinal("given_file_name")) ? null : reader.GetString(reader.GetOrdinal("given_file_name")),
        UserId = reader.GetInt32(reader.GetOrdinal("user_id")),
        Username = reader.IsDBNull(reader.GetOrdinal("username")) ? null : reader.GetString(reader.GetOrdinal("username")),
        CommentCount = reader.IsDBNull(reader.GetOrdinal("comment_count")) ? 0 : reader.GetInt32(reader.GetOrdinal("comment_count")),
        ReactionCount = reader.IsDBNull(reader.GetOrdinal("reaction_count")) ? 0 : reader.GetInt32(reader.GetOrdinal("reaction_count"))
      };
    }

    return null;
  }

  private async Task InsertMemeStoryAsync(MySqlConnection conn, MySqlTransaction transaction, string storyText, int fileId, int? profileUserId)
  {
    // Insert the main story
    const string insertStorySql = @"
            INSERT INTO stories (user_id, story_text, profile_user_id, city, country, date)
            VALUES (@userId, @storyText, @profileUserId, NULL, NULL, UTC_TIMESTAMP());
            SELECT LAST_INSERT_ID();";

    using var storyCmd = new MySqlCommand(insertStorySql, conn, transaction);
    storyCmd.Parameters.AddWithValue("@userId", memeServiceAccountNo);
    storyCmd.Parameters.AddWithValue("@storyText", storyText);
    storyCmd.Parameters.AddWithValue("@profileUserId", profileUserId ?? (object)DBNull.Value);

    var storyId = Convert.ToInt32(await storyCmd.ExecuteScalarAsync());

    // Link the meme file to the story
    const string insertStoryFileSql = @"
            INSERT INTO story_files (story_id, file_id)
            VALUES (@storyId, @fileId);

            INSERT INTO story_topics (story_id, topic_id) 
            VALUES (@storyId, (SELECT id FROM topics WHERE topic = 'Meme'));";

    using var fileCmd = new MySqlCommand(insertStoryFileSql, conn, transaction);
    fileCmd.Parameters.AddWithValue("@storyId", storyId);
    fileCmd.Parameters.AddWithValue("@fileId", fileId);
    await fileCmd.ExecuteNonQueryAsync();

    try
    {
      string eventText = $"Top Daily Meme posted!";
      await UserEventController.InsertUserEventWithConnection(memeServiceAccountNo, "daily_meme", eventText, fileId, "file", conn, transaction);
    }
    catch { }
  }
  private string GetMostFrequentWord(ArticlesResult? topArticlesResult, out List<(Article Article, List<string> Tokens)> articleTokenMap)
  {
    var tokenFrequency = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
    articleTokenMap = new List<(Article Article, List<string> Tokens)>();
    if (topArticlesResult?.Articles == null) return string.Empty;

    foreach (var article in topArticlesResult.Articles)
    {
      var tokens = TokenizeText(article.Description ?? string.Empty);
      articleTokenMap.Add((article, tokens));

      foreach (var token in tokens)
      {
        if (tokenFrequency.ContainsKey(token))
          tokenFrequency[token]++;
        else
          tokenFrequency[token] = 1;
      }
    }

    // Find the most frequent word
    return tokenFrequency.OrderByDescending(kv => kv.Value).First().Key;
  }

  private async Task<bool> CheckIfDailyNewsStoryAlreadyExists(MySqlConnection conn, MySqlTransaction transaction, string checkSql)
  {
    await using (var checkCmd = new MySqlCommand(checkSql, conn, transaction))
    {
      var exists = Convert.ToInt32(await checkCmd.ExecuteScalarAsync()) > 0;
      if (exists)
      {
        //await _log.Db("Daily news story already exists. Skipping creation.", null, "NEWSSERVICE", outputToConsole: true);
        await transaction.RollbackAsync();
        return true;
      }
    }
    return false;
  }

  private List<string> TokenizeText(string input)
  {
    if (string.IsNullOrWhiteSpace(input))
      return new List<string>();

    var tokens = Regex
        .Matches(input.ToLowerInvariant(), @"\b[a-zA-Z]{2,}\b")
        .Select(match => match.Value)
        .Where(token => !Stopwords.Contains(token))
        .ToList();

    return tokens;
  }

  /// <summary>
  /// Count occurrences of negative sentiment words across the provided articles (title + description + content).
  /// </summary>
  private int CountNegativeWordsAcrossArticles(List<Article> articles)
  {
    if (articles == null || articles.Count == 0) return 0;
    int total = 0;
    foreach (var a in articles)
    {
      var sb = new StringBuilder();
      if (!string.IsNullOrWhiteSpace(a.Title)) sb.Append(a.Title).Append(' ');
      if (!string.IsNullOrWhiteSpace(a.Description)) sb.Append(a.Description).Append(' ');
      if (!string.IsNullOrWhiteSpace(a.Content)) sb.Append(a.Content).Append(' ');
      var text = sb.ToString().ToLowerInvariant();
      foreach (var word in NegativeSentimentWords)
      {
        if (string.IsNullOrWhiteSpace(word)) continue;
        int idx = 0;
        while ((idx = text.IndexOf(word, idx, StringComparison.OrdinalIgnoreCase)) >= 0)
        {
          total++;
          idx += word.Length;
        }
      }
    }
    return total;
  }

  /// <summary>
  /// Persist sentiment count into news_sentiment_score table.
  /// Creates the table if it does not exist.
  /// </summary>
  private async Task SaveSentimentCountAsync(MySqlConnection conn, int count, List<int>? articleIds = null)
  {
    if (conn == null) throw new ArgumentNullException(nameof(conn));
    string insertSql = @"INSERT INTO news_sentiment_score (recorded_at, negative_count, article_ids) VALUES (UTC_TIMESTAMP(), @count, @articleIds);";
    using (var insertCmd = new MySqlCommand(insertSql, conn))
    {
      insertCmd.Parameters.AddWithValue("@count", count);
      var json = articleIds == null || articleIds.Count == 0 ? (object)DBNull.Value : System.Text.Json.JsonSerializer.Serialize(articleIds);
      insertCmd.Parameters.AddWithValue("@articleIds", json);
      await insertCmd.ExecuteNonQueryAsync();
    }
  }

  private int CountNegativeWordsInArticle(Article a)
  {
    if (a == null) return 0;
    var sb = new StringBuilder();
    if (!string.IsNullOrWhiteSpace(a.Title)) sb.Append(a.Title).Append(' ');
    if (!string.IsNullOrWhiteSpace(a.Description)) sb.Append(a.Description).Append(' ');
    if (!string.IsNullOrWhiteSpace(a.Content)) sb.Append(a.Content).Append(' ');
    // Use regex word-boundary matching for each phrase to avoid substrings triggering false positives.
    var text = sb.ToString();
    int total = 0;
    foreach (var phrase in NegativeSentimentWords)
    {
      if (string.IsNullOrWhiteSpace(phrase)) continue;
      try
      {
        var pattern = "\\b" + Regex.Escape(phrase) + "\\b";
        var matches = Regex.Matches(text, pattern, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        total += matches.Count;
      }
      catch
      {
        // On any unexpected regex error, fall back to a case-insensitive index search for the phrase
        int idx = 0;
        while ((idx = text.IndexOf(phrase, idx, StringComparison.OrdinalIgnoreCase)) >= 0)
        {
          total++;
          idx += phrase.Length;
        }
      }
    }
    return total;
  }
  private async Task<int?> FindBestMatchingFileAsync(List<string> tokens, MySqlConnection conn, MySqlTransaction transaction)
  {
    if (tokens == null || tokens.Count == 0)
      return null;

    // Filter out empty tokens
    var validTokens = tokens.Where(t => !string.IsNullOrWhiteSpace(t)).ToList();
    if (validTokens.Count == 0)
      return null;

    // Build the dynamic SQL query
    var sql = new StringBuilder(@"
        SELECT 
            id,
            (
                IFNULL((
                    SELECT SUM(
                        CASE 
                            WHEN LOWER(file_name) LIKE CONCAT('%', LOWER(token), '%') THEN 1 
                            ELSE 0 
                        END
                    )
                    FROM (");

    // Add token parameters for file_name matching
    for (int i = 0; i < validTokens.Count; i++)
    {
      sql.Append(i == 0 ? "SELECT ? AS token" : " UNION SELECT ?");
    }

    sql.Append(@") AS tokens
                    WHERE token <> '' AND token IS NOT NULL
                ), 0) +
                IFNULL((
                    SELECT SUM(
                        CASE 
                            WHEN LOWER(given_file_name) LIKE CONCAT('%', LOWER(token), '%') THEN 1 
                            ELSE 0 
                        END
                    )
                    FROM (");

    // Add token parameters for given_file_name matching
    for (int i = 0; i < validTokens.Count; i++)
    {
      sql.Append(i == 0 ? "SELECT ? AS token" : " UNION SELECT ?");
    }

    sql.Append($@") AS tokens
                    WHERE token <> '' AND token IS NOT NULL
                ), 0)
            ) AS score
        FROM file_uploads
        WHERE is_folder = 0
        AND is_public = 1
        AND folder_path = '{MemeFolderPath}' 
        AND (file_name IS NOT NULL OR given_file_name IS NOT NULL) 
        AND file_type IN (
            'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif', 'svg', 'ico', 'heic', 'heif', 'raw', 'cr2', 'nef', 'orf', 'arw',
            'mp4', 'm4v', 'mov', 'avi', 'wmv', 'flv', 'webm', 'mkv', 'mpeg', 'mpg', '3gp', '3g2', 'mts', 'm2ts', 'ts', 'vob', 'ogv'
        )
        HAVING score > 0
        ORDER BY score DESC
        LIMIT 1");

    await using var cmd = new MySqlCommand(sql.ToString(), conn, transaction);

    // Add parameters twice (once for file_name matching, once for given_file_name matching)
    foreach (var token in validTokens)
    {
      cmd.Parameters.AddWithValue("", token);
    }
    foreach (var token in validTokens)
    {
      cmd.Parameters.AddWithValue("", token);
    }

    var result = await cmd.ExecuteScalarAsync();
    return result != null ? (int?)Convert.ToInt32(result) : null;
  }

  public async Task CreateDailyCryptoNewsStoryAsync()
  {
    try
    {
      // Fast pre-check: verify we have at least 20 recent articles (last 24h)
      if (!await HasAtleast20NewsArticlesIn24HrsAsync())
      {
        return;
      }

      await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();
      await using var transaction = await conn.BeginTransactionAsync();

      // Check if a social story already exists for today (user_id = {cryptoNewsServiceAccountNo}, contains marker text)
      string marker = "📰 [b]Crypto News Update![/b]";
      string checkSql = $@"
				SELECT COUNT(*) FROM stories
				WHERE user_id = {cryptoNewsServiceAccountNo} AND DATE(`date`) = CURDATE();
			";


      if (await CheckIfDailyNewsStoryAlreadyExists(conn, transaction, checkSql))
      {
        await _log.Db("Daily crypto news story already exists. Skipping creation.", null, "NEWSSERVICE", outputToConsole: true);
        return;
      }

      var topArticlesResult = await GetTopCryptoArticleAsync(1);
      if (topArticlesResult == null)
      {
        await _log.Db("No crypto articles to write a social story about", null, "NEWSSERVICE", outputToConsole: true);
        return;
      }
      // Build story text from all articles
      var sb = new StringBuilder();
      sb.AppendLine(marker);
      sb.AppendLine($"[*][b]{topArticlesResult.Title}[/b]\nRead more: {topArticlesResult.Url} [/*]");


      string fullStoryText = sb.ToString().Trim();
      var selectedArticleTokens = TokenizeText(fullStoryText);
      // Insert the story into the 'stories' table (for the news service account)
      await CreateNewsPosts(conn, transaction, fullStoryText, selectedArticleTokens, cryptoNewsServiceAccountNo);
      await _log.Db("Daily crypto news story created successfully.", null, "NEWSSERVICE", outputToConsole: true);
    }
    catch (Exception ex)
    {
      await _log.Db("Error in CreateDailyCryptoNewsStoryAsync: " + ex.Message, null, "NEWSSERVICE", outputToConsole: true);
    }
  }
  public async Task<Article?> GetTopCryptoArticleAsync(int daysBack = 1)
  {
    try
    {
      using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();

      // Query to get potential candidates with some basic filtering
      string sql = @"
            SELECT 
                title, description, url, published_at, url_to_image, author, content, saved_at,
                LENGTH(content) as content_length,
                (CASE WHEN author IS NOT NULL AND author != '' THEN 1 ELSE 0 END) as has_author,
                (CASE WHEN url_to_image IS NOT NULL AND url_to_image != '' THEN 1 ELSE 0 END) as has_image
            FROM news_headlines
            WHERE saved_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL @daysBack DAY)
            ORDER BY saved_at DESC
            LIMIT 100;  // Get a reasonable number to evaluate
        ";

      using var cmd = new MySqlCommand(sql, conn);
      cmd.Parameters.AddWithValue("@daysBack", daysBack);
      using var reader = await cmd.ExecuteReaderAsync();

      var candidates = new List<(Article Article, int ContentLength, bool HasAuthor, bool HasImage)>();

      while (await reader.ReadAsync())
      {
        var article = new Article
        {
          Title = reader["title"]?.ToString(),
          Description = reader["description"]?.ToString(),
          Url = reader["url"]?.ToString(),
          PublishedAt = reader["published_at"] as DateTime?,
          Source = new ApiSource { Id = "local-db", Name = "SavedHeadline" },
          Author = reader["author"]?.ToString(),
          Content = reader["content"]?.ToString(),
          UrlToImage = reader["url_to_image"]?.ToString()
        };

        if (article.PublishedAt == null) continue;

        candidates.Add((
          article,
          ContentLength: reader["content_length"] as int? ?? 0,
          HasAuthor: (reader["has_author"] as int? ?? 0) == 1,
          HasImage: (reader["has_image"] as int? ?? 0) == 1
        ));
      }

      // Score and select the best article
      var scoredArticles = candidates.Select(candidate =>
      {
        var score = CalculateCryptoArticleScore(
          candidate.Article,
          candidate.ContentLength,
          candidate.HasAuthor,
          candidate.HasImage);
        return (Article: candidate.Article, Score: score);
      })
      .Where(x => x.Score > 0)  // Only consider articles with some crypto relevance
      .OrderByDescending(x => x.Score)
      .ToList();

      return scoredArticles.FirstOrDefault().Article;
    }
    catch (Exception ex)
    {
      await _log.Db("Exception in GetTopCryptoArticleAsync: " + ex.Message, null, "NEWSSERVICE", outputToConsole: true);
      return null;
    }
  }

  private float CalculateCryptoArticleScore(Article article, int contentLength, bool hasAuthor, bool hasImage)
  {
    if (article.Title == null || article.Content == null)
      return 0;

    // Combine text fields for analysis
    string combinedText = $"{article.Title} {article.Description} {article.Content}".ToLower();

    // 1. Keyword relevance (more matches = higher score)
    var words = Regex.Matches(combinedText, @"\b[a-zA-Z0-9]+\b")
            .Select(m => m.Value.ToLowerInvariant())
            .ToHashSet();

    var keywordMatches = CryptoKeywords
      .Select(keyword => keyword.ToLowerInvariant())
      .Count(keyword =>
        words.Contains(keyword) ||
        words.Contains(keyword + "s") ||
        words.Contains(keyword + "es"));
    if (keywordMatches == 0)
      return 0;

    float keywordScore = keywordMatches * 2.0f;

    // 2. Content quality indicators
    float qualityScore = 0;

    // Longer content is generally better
    qualityScore += Math.Min(contentLength / 1000.0f, 5); // Max 5 points

    // Has author and image
    if (hasAuthor) qualityScore += 1;
    if (hasImage) qualityScore += 1;

    // 3. Title indicators (exclamation, question marks might indicate importance)
    if (article.Title.Contains("!")) qualityScore += 0.5f;
    if (article.Title.Contains("?")) qualityScore += 0.3f;

    // 4. Major keywords boost (Bitcoin, Ethereum, etc.)
    var majorKeywords = new[] { "bitcoin", "ethereum", "crypto", "cryptocurrency", "blockchain" };
    var majorMatches = majorKeywords.Count(k => words.Contains(k));
    float majorKeywordBoost = majorMatches * 3.0f;

    // 5. Negative indicators (reduce score for clickbait)
    float negativeScore = 0;
    var clickbaitWords = new[] { "secret", "shocking", "you won't believe", "this one trick" };
    if (clickbaitWords.Any(w => article.Title.ToLower().Contains(w)))
    {
      negativeScore -= 3.0f;
    }
    foreach (var negKeyword in NegativeKeywordsForCryptoArticles)
    {
      if (combinedText.Contains(negKeyword))
      {
        negativeScore -= 5.0f; // Heavy penalty for sports terms
        break;
      }
    }
    // 6. Recentness (newer articles get slightly higher score)
    float recentnessScore = 0;
    if (article.PublishedAt.HasValue)
    {
      var hoursOld = (DateTime.UtcNow - article.PublishedAt.Value).TotalHours;
      recentnessScore = (float)Math.Max(0, 5 - (hoursOld / 24.0)); // Up to 5 points for freshness
    }

    // Combine all scores
    float totalScore =
      keywordScore +
      qualityScore +
      majorKeywordBoost +
      negativeScore +
      recentnessScore;

    return totalScore;
  }
  public async Task<int> GetNewsCountInLast24HoursAsync()
  {
    try
    {
      // Get the current time (UTC now)
      DateTime now = DateTime.UtcNow;
      DateTime twentyFourHoursAgo = now.AddHours(-24);

      // Open the database connection
      using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();

      // SQL query to count stories created in the last 24 hours
      string checkSql = $@"
				SELECT COUNT(*) 
				FROM news_headlines 
				WHERE saved_at BETWEEN @startTime AND @endTime;";

      // Prepare and execute the command
      await using var cmd = new MySqlCommand(checkSql, conn);
      cmd.Parameters.AddWithValue("@startTime", twentyFourHoursAgo);
      cmd.Parameters.AddWithValue("@endTime", now);

      // Execute the query and get the result
      var count = Convert.ToInt32(await cmd.ExecuteScalarAsync());

      // Log if necessary
      //await _log.Db($"Found {count} articles in the last 24 hours", null, "NEWSSERVICE", true);

      // Return the count
      return count;
    }
    catch (Exception ex)
    {
      // Log any errors
      await _log.Db($"Error retrieving story count: {ex.Message}", null, "NEWSSERVICE", outputToConsole: true);
      return 0; // Return 0 in case of an error
    }
  }

  /// <summary>
  /// Fast check whether there are at least 20 articles saved within the last 24 hours.
  /// This selects the latest 20 saved_at timestamps (fast with proper index) and then
  /// checks whether the 20th-most-recent timestamp is within the past 24 hours.
  /// </summary>
  public async Task<bool> HasAtleast20NewsArticlesIn24HrsAsync()
  {
    try
    {
      using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();

      // Get the most recent 20 timestamps. This avoids a full table scan and relies on
      // an index on `saved_at` (if present) to be fast.
      const string sql = @"SELECT saved_at FROM news_headlines ORDER BY saved_at DESC LIMIT 20;";
      await using var cmd = new MySqlCommand(sql, conn);
      var timestamps = new List<DateTime>();
      await using var reader = await cmd.ExecuteReaderAsync();
      while (await reader.ReadAsync())
      {
        if (!reader.IsDBNull(0))
        {
          // Use UTC assumption for saved_at column
          var dt = reader.GetDateTime(0);
          timestamps.Add(DateTime.SpecifyKind(dt, DateTimeKind.Utc));
        }
      }

      if (timestamps.Count < 20) return false;

      // The 20th-most-recent item is the last in the list
      var twentieth = timestamps[timestamps.Count - 1];
      var cutoff = DateTime.UtcNow.AddHours(-24);
      return twentieth >= cutoff;
    }
    catch (Exception ex)
    {
      await _log.Db($"Error in HasAtleast20NewsArticlesIn24HrsAsync: {ex.Message}", null, "NEWSSERVICE", outputToConsole: true);
      return false;
    }
  }

  private async Task ExtractAndSaveNewsPins(List<Article> articles)
  {
    if (articles == null || articles.Count == 0) return;

    using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
    await conn.OpenAsync();

    string insertSql = @"INSERT IGNORE INTO news_pins (article_url, article_title, lat, lon, label, location_type, created_at)
      VALUES (@url, @title, @lat, @lon, @label, @type, UTC_TIMESTAMP());";

    foreach (var article in articles)
    {
      if (string.IsNullOrWhiteSpace(article.Url)) continue;
      var locations = ExtractLocations(article);
      foreach (var (lat, lon, label, type) in locations)
      {
        try
        {
          using var cmd = new MySqlCommand(insertSql, conn);
          cmd.Parameters.AddWithValue("@url", article.Url);
          cmd.Parameters.AddWithValue("@title", article.Title ?? "");
          cmd.Parameters.AddWithValue("@lat", lat);
          cmd.Parameters.AddWithValue("@lon", lon);
          cmd.Parameters.AddWithValue("@label", label);
          cmd.Parameters.AddWithValue("@type", type);
          await cmd.ExecuteNonQueryAsync();
        }
        catch (Exception ex)
        {
          await _log.Db($"Failed to insert news pin for '{label}': {ex.Message}", null, "NEWSSERVICE");
        }
      }
    }
  }

  private List<(double Lat, double Lon, string Label, string Type)> ExtractLocations(Article article)
  {
    var results = new List<(double, double, string, string)>();
    var matched = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

    string text = $"{article.Title ?? ""} {article.Description ?? ""} {article.Content ?? ""}";
    string url = article.Url ?? "";

    foreach (var kv in NewsCountryCoords)
    {
      if (matched.Contains(kv.Key)) continue;
      if (text.Contains(kv.Key, StringComparison.OrdinalIgnoreCase) ||
          url.Contains(kv.Key.Replace(" ", ""), StringComparison.OrdinalIgnoreCase))
      {
        results.Add((kv.Value.Lat, kv.Value.Lon, CultureInfo.CurrentCulture.TextInfo.ToTitleCase(kv.Key), "country"));
        matched.Add(kv.Key);
      }
    }

    foreach (var kv in NewsCityCoords)
    {
      if (matched.Contains(kv.Key)) continue;
      if (text.Contains(kv.Key, StringComparison.OrdinalIgnoreCase) ||
          url.Contains(kv.Key.Replace(" ", ""), StringComparison.OrdinalIgnoreCase))
      {
        results.Add((kv.Value.Lat, kv.Value.Lon, CultureInfo.CurrentCulture.TextInfo.ToTitleCase(kv.Key), "city"));
        matched.Add(kv.Key);
      }
    }

    return results;
  }

  private class MemeInfo
  {
    public int Id { get; set; }
    public string? FileName { get; set; }
    public string? GivenFileName { get; set; }
    public int UserId { get; set; }
    public string? Username { get; set; }
    public int CommentCount { get; set; }
    public int ReactionCount { get; set; }
  }
}
