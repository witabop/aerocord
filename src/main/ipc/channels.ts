export const IPC = {
  // Auth
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_GET_STATE: 'auth:getState',

  // User
  USER_GET_CURRENT: 'user:getCurrent',
  USER_SET_STATUS: 'user:setStatus',
  USER_SET_CUSTOM_STATUS: 'user:setCustomStatus',
  USER_GET_PROFILE: 'user:getProfile',

  // Contacts
  CONTACTS_GET_PRIVATE_CHANNELS: 'contacts:getPrivateChannels',
  CONTACTS_GET_GUILDS: 'contacts:getGuilds',
  CONTACTS_GET_FRIENDS: 'contacts:getFriends',
  CONTACTS_SEND_FRIEND_REQUEST: 'contacts:sendFriendRequest',
  CONTACTS_GET_PENDING_REQUESTS: 'contacts:getPendingRequests',
  CONTACTS_GET_FAVORITES: 'contacts:getFavorites',
  CONTACTS_SET_FAVORITES: 'contacts:setFavorites',

  // Messages
  MESSAGES_GET: 'messages:get',
  MESSAGES_SEND: 'messages:send',
  MESSAGES_EDIT: 'messages:edit',
  MESSAGES_DELETE: 'messages:delete',
  MESSAGES_TRIGGER_TYPING: 'messages:triggerTyping',

  // Channels
  CHANNELS_GET: 'channels:get',
  CHANNELS_GET_GUILD_CHANNELS: 'channels:getGuildChannels',
  CHANNELS_GET_MEMBERS: 'channels:getMembers',

  // Voice
  VOICE_JOIN: 'voice:join',
  VOICE_LEAVE: 'voice:leave',
  VOICE_SET_SELF_MUTE: 'voice:setSelfMute',
  VOICE_SET_SELF_DEAFEN: 'voice:setSelfDeafen',
  VOICE_SET_USER_VOLUME: 'voice:setUserVolume',
  VOICE_GET_STATES: 'voice:getStates',
  VOICE_AUDIO_CHUNK: 'voice:audioChunk',
  VOICE_JOINED: 'voice:joined',
  VOICE_LEFT: 'voice:left',
  VOICE_SPEAKING: 'voice:speaking',
  VOICE_AUDIO_DATA: 'voice:audioData',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',

  // Theme
  THEME_GET_SCENES: 'theme:getScenes',
  THEME_SET_SCENE: 'theme:setScene',
  THEME_GET_CURRENT: 'theme:getCurrent',

  // Assets
  ASSETS_GET_PATH: 'assets:getPath',
  ASSETS_LIST_GIFS: 'assets:listGifs',

  // Windows
  WINDOW_OPEN_CHAT: 'window:openChat',
  WINDOW_OPEN_SETTINGS: 'window:openSettings',
  WINDOW_CLOSE: 'window:close',

  // Events (main -> renderer)
  EVENT_READY: 'event:ready',
  EVENT_MESSAGE_CREATE: 'event:messageCreate',
  EVENT_MESSAGE_DELETE: 'event:messageDelete',
  EVENT_MESSAGE_UPDATE: 'event:messageUpdate',
  EVENT_PRESENCE_UPDATE: 'event:presenceUpdate',
  EVENT_TYPING_START: 'event:typingStart',
  EVENT_VOICE_STATE_UPDATE: 'event:voiceStateUpdate',
  EVENT_CHANNEL_CREATE: 'event:channelCreate',
  EVENT_CHANNEL_DELETE: 'event:channelDelete',
  EVENT_LOGIN_STATUS: 'event:loginStatus',
  PLAY_SOUND: 'play-sound',
} as const;
