import { useState, useEffect, useRef, useMemo } from 'react';
import Hls from 'hls.js';
import { Tv, Heart, Search, Filter, Flame } from 'lucide-react';

export default function App() {
  const [channels, setChannels] = useState([]);
  const [currentStream, setCurrentStream] = useState(null);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [visibleCount, setVisibleCount] = useState(50);
  
  const videoRef = useRef(null);

  // .env থেকে কাস্টম চ্যানেলগুলোর লিস্ট নেওয়া
  const featuredKeywords = useMemo(() => {
    const envKeywords = import.meta.env.VITE_FEATURED_CHANNELS || '';
    return envKeywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 0);
  }, []);

  const parseM3U = (text) => {
    const lines = text.split('\n');
    const result = [];
    let currentChannel = {};

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.startsWith('#EXTINF:')) {
        const groupMatch = line.match(/group-title="([^"]+)"/i);
        // সেমিকোলন ফিক্স: সেমিকোলন দিয়ে ভাগ করে শুধু প্রথম ক্যাটাগরিটি নেওয়া
        let rawCategory = groupMatch ? groupMatch[1] : 'Uncategorized';
        currentChannel.category = rawCategory.split(';')[0].trim();
        
        const logoMatch = line.match(/tvg-logo="([^"]+)"/i);
        currentChannel.logo = logoMatch ? logoMatch[1] : null;
        
        const parts = line.split(',');
        currentChannel.name = parts[parts.length - 1]?.trim() || 'Unknown Channel';
      } else if (line && !line.startsWith('#')) {
        currentChannel.url = line;
        if (currentChannel.name && currentChannel.url) {
          result.push({ ...currentChannel });
        }
        currentChannel = {};
      }
    }
    return result;
  };

  useEffect(() => {
    const fetchChannels = async () => {
      setLoading(true);
      try {
        const envLinks = import.meta.env.VITE_IPTV_LINKS || 'https://iptv-org.github.io/iptv/categories/sports.m3u';
        const linkArray = envLinks.split(',').filter(link => link.trim() !== '');
        let allChannels = [];

        for (const url of linkArray) {
          try {
            const response = await fetch(url.trim());
            if (response.ok) {
              const text = await response.text();
              allChannels = [...allChannels, ...parseM3U(text)];
            }
          } catch (err) {
            console.error("Link fetch error:", url, err);
          }
        }

        setChannels(allChannels);
        const savedFavs = JSON.parse(localStorage.getItem('favChannels')) || [];
        setFavorites(savedFavs);

        if (allChannels.length > 0) setCurrentStream(allChannels[0]);
      } catch (error) {
        console.error("Critical fetch error:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchChannels();
  }, []);

  useEffect(() => {
    if (currentStream && videoRef.current) {
      const video = videoRef.current;
      if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(currentStream.url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => console.log("Auto-play prevented"));
        });
        return () => hls.destroy();
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = currentStream.url;
        video.addEventListener('loadedmetadata', () => {
          video.play().catch(() => console.log("Auto-play prevented"));
        });
      }
    }
  }, [currentStream]);

  const toggleFavorite = (channelName, e) => {
    e.stopPropagation();
    if (!channelName) return;
    
    let updatedFavs = [...favorites];
    if (updatedFavs.includes(channelName)) {
      updatedFavs = updatedFavs.filter(name => name !== channelName);
    } else {
      updatedFavs.push(channelName);
    }
    setFavorites(updatedFavs);
    localStorage.setItem('favChannels', JSON.stringify(updatedFavs));
  };

  // ক্যাটাগরি লিস্ট আপডেট (Featured সবার উপরে থাকবে)
  const categories = useMemo(() => {
    const cats = new Set(channels.map(ch => ch.category));
    return ['All', 'Favorites', '🔥 Potential FIFA TV Server', ...Array.from(cats)].filter(Boolean);
  }, [channels]);

  // ফিল্টারিং লজিক আপডেট
  const filteredChannels = useMemo(() => {
    return channels.filter(channel => {
      if (!channel) return false;
      let categoryMatch = true;

      if (selectedCategory === 'Favorites') {
        categoryMatch = favorites.includes(channel.name);
      } else if (selectedCategory === '🔥 Potential FIFA TV Server') {
        // .env এর সাথে নাম মিলিয়ে দেখা
        categoryMatch = featuredKeywords.some(keyword => 
          channel.name.toLowerCase().includes(keyword)
        );
      } else if (selectedCategory !== 'All') {
        categoryMatch = channel.category === selectedCategory;
      }
      
      const searchMatch = channel.name?.toLowerCase().includes(searchQuery.toLowerCase());
      return categoryMatch && searchMatch;
    });
  }, [channels, selectedCategory, searchQuery, favorites, featuredKeywords]);

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setVisibleCount(50);
  };

  const handleCategoryChange = (e) => {
    setSelectedCategory(e.target.value);
    setVisibleCount(50);
  };

  const handleScroll = (e) => {
    const target = e.target;
    if (target.scrollHeight - target.scrollTop <= target.clientHeight + 100) {
      setVisibleCount(prev => Math.min(prev + 50, filteredChannels.length));
    }
  };

  const displayedChannels = useMemo(() => {
    return filteredChannels.slice(0, visibleCount);
  }, [filteredChannels, visibleCount]);

  return (
    <div className="min-h-screen p-4 md:p-8 font-sans bg-gray-900 text-white">
      <header className="flex items-center gap-3 mb-8 border-b border-gray-800 pb-4">
        <Tv className="w-8 h-8 text-green-500" />
        <h1 className="text-2xl md:text-3xl font-bold bg-linear-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
          Nexus Live TV
        </h1>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
        <div className="lg:col-span-2">
          <div className="sticky top-4">
            <div className="bg-black rounded-xl overflow-hidden shadow-2xl shadow-green-900/20 aspect-video relative border border-gray-800">
              {loading ? (
                <div className="flex items-center justify-center w-full h-full">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500"></div>
                </div>
              ) : (
                <video ref={videoRef} controls className="w-full h-full bg-black" />
              )}
            </div>
            {currentStream && (
              <div className="mt-4 bg-gray-800/80 p-4 rounded-lg flex justify-between items-center border border-gray-700">
                <div className="flex items-center gap-4">
                  {currentStream.logo && (
                    <img src={currentStream.logo} alt="" className="h-10 w-auto object-contain bg-gray-900 p-1 rounded" onError={(e) => e.target.style.display='none'} />
                  )}
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></span>
                    {currentStream.name}
                  </h2>
                </div>
                <span className="text-sm bg-gray-700 px-3 py-1 rounded-full text-gray-300">
                  {currentStream.category}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-gray-900/80 rounded-xl border border-gray-800 p-4 flex flex-col h-[75vh]">
          <div className="mb-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search channels..." 
                value={searchQuery}
                onChange={handleSearchChange}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-green-500"
              />
            </div>
            
            <div className="flex items-center gap-2">
              {/* Highlight Icon for Category */}
              {selectedCategory === '🔥 Featured Games' ? (
                <Flame className="w-4 h-4 text-orange-500 animate-pulse" />
              ) : (
                <Filter className="w-4 h-4 text-gray-400" />
              )}
              
              <select 
                value={selectedCategory}
                onChange={handleCategoryChange}
                className={`flex-1 bg-gray-800 border rounded-lg px-3 py-2 text-sm text-white focus:outline-none transition-colors ${
                  selectedCategory === '🔥 Featured Games' ? 'border-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.3)]' : 'border-gray-700 focus:border-green-500'
                }`}
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="text-xs text-gray-400 mb-2 font-medium">
            Showing {displayedChannels.length} of {filteredChannels.length} Channels
          </div>
          
          <div 
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar"
          >
            {displayedChannels.length === 0 && !loading ? (
              <div className="text-center text-gray-500 mt-10">No channels found in this category</div>
            ) : (
              displayedChannels.map((channel, idx) => {
                const isPlaying = currentStream?.url === channel.url;
                const isFav = favorites.includes(channel.name);
                return (
                  <div 
                    key={idx} 
                    className={`flex items-center justify-between p-3 rounded-lg transition-all cursor-pointer ${
                      isPlaying 
                        ? 'bg-linear-to-r from-green-900/50 to-gray-800 border-l-4 border-green-500' 
                        : 'bg-gray-800/40 hover:bg-gray-700'
                    }`}
                    onClick={() => setCurrentStream(channel)}
                  >
                    <div className="flex items-center gap-3 flex-1 overflow-hidden">
                      <div className="w-10 h-10 bg-gray-900 rounded flex items-center justify-center overflow-hidden shrink-0 border border-gray-700">
                        {channel.logo ? (
                          <img 
                            src={channel.logo} 
                            alt=""
                            loading="lazy"
                            className="w-full h-full object-contain p-1"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              if (e.target.nextSibling) e.target.nextSibling.style.display = 'block';
                            }}
                          />
                        ) : null}
                        <Tv className={`w-5 h-5 text-gray-500 ${channel.logo ? 'hidden' : 'block'}`} />
                      </div>

                      <div className="flex flex-col overflow-hidden">
                        <span className={`font-medium truncate ${isPlaying ? 'text-green-400' : 'text-gray-200'}`}>
                          {channel.name}
                        </span>
                        <span className="text-[10px] text-gray-500 truncate">{channel.category}</span>
                      </div>
                    </div>
                    
                    <button 
                      onClick={(e) => toggleFavorite(channel.name, e)}
                      className="p-2 hover:bg-gray-600 rounded-full transition-colors ml-2 shrink-0"
                    >
                      <Heart className={`w-5 h-5 ${isFav ? 'fill-red-500 text-red-500' : 'text-gray-500'}`} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}