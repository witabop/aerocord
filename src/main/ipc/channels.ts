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
  CONTACTS_ACCEPT_FRIEND_REQUEST: 'contacts:acceptFriendRequest',
  CONTACTS_IGNORE_FRIEND_REQUEST: 'contacts:ignoreFriendRequest',
  CONTACTS_REMOVE_FRIEND: 'contacts:removeFriend',
  CONTACTS_GET_FAVORITES: 'contacts:getFavorites',
  CONTACTS_SET_FAVORITES: 'contacts:setFavorites',

  // Messages
  MESSAGES_GET: 'messages:get',
  MESSAGES_GET_BEFORE: 'messages:getBefore',
  MESSAGES_SEND: 'messages:send',
  MESSAGES_EDIT: 'messages:edit',
  MESSAGES_DELETE: 'messages:delete',
  MESSAGES_TRIGGER_TYPING: 'messages:triggerTyping',
  MESSAGES_ACK: 'messages:ack',

  // Channels
  CHANNELS_GET: 'channels:get',
  CHANNELS_GET_GUILD_CHANNELS: 'channels:getGuildChannels',
  CHANNELS_GET_MEMBERS: 'channels:getMembers',
  CHANNELS_SEARCH_MEMBERS: 'channels:searchMembers',
  CHANNELS_GET_OR_CREATE_DM: 'channels:getOrCreateDM',
  CHANNELS_CLOSE_CONVERSATION: 'channels:closeConversation',

  // Voice
  VOICE_JOIN: 'voice:join',
  VOICE_LEAVE: 'voice:leave',
  VOICE_SET_SELF_MUTE: 'voice:setSelfMute',
  VOICE_SET_SELF_DEAFEN: 'voice:setSelfDeafen',
  VOICE_SET_INPUT_VOLUME: 'voice:setInputVolume',
  VOICE_GET_INPUT_VOLUME: 'voice:getInputVolume',
  VOICE_SET_USER_VOLUME: 'voice:setUserVolume',
  VOICE_GET_USER_VOLUME: 'voice:getUserVolume',
  VOICE_SET_USER_MUTED: 'voice:setUserMuted',
  VOICE_GET_USER_MUTED: 'voice:getUserMuted',
  VOICE_GET_STATES: 'voice:getStates',
  VOICE_AUDIO_CHUNK: 'voice:audioChunk',
  VOICE_JOINED: 'voice:joined',
  VOICE_LEFT: 'voice:left',
  VOICE_SPEAKING: 'voice:speaking',
  VOICE_AUDIO_DATA: 'voice:audioData',

  // DM Calls
  CALL_START: 'call:start',
  CALL_ACCEPT: 'call:accept',
  CALL_DECLINE: 'call:decline',
  CALL_HANGUP: 'call:hangup',
  CALL_INCOMING: 'call:incoming',
  CALL_OUTGOING: 'call:outgoing',
  CALL_ACTIVE: 'call:active',
  CALL_ENDED: 'call:ended',
  CALL_GET_STATE: 'call:getState',

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

  // Klipy GIF API (Web section)
  GIFS_HAS_KEYS: 'gifs:hasKeys',
  GIFS_FETCH_TRENDING: 'gifs:fetchTrending',
  GIFS_SEARCH: 'gifs:search',

  // Dialog / Files
  DIALOG_PICK_FILES: 'dialog:pickFiles',
  FILES_WRITE_TEMP: 'files:writeTemp',
  FILES_GET_PREVIEW_DATA_URL: 'files:getPreviewDataUrl',

  // Shell
  SHELL_OPEN_EXTERNAL: 'shell:openExternal',

  // App
  APP_GET_VERSION: 'app:getVersion',

  // Windows
  WINDOW_OPEN_CHAT: 'window:openChat',
  WINDOW_OPEN_SETTINGS: 'window:openSettings',
  WINDOW_OPEN_NOTIFICATION: 'window:openNotification',
  WINDOW_CLOSE: 'window:close',

  // Events (main -> renderer)
  EVENT_SCENE_CHANGE: 'event:sceneChange',
  EVENT_READY: 'event:ready',
  EVENT_MESSAGE_CREATE: 'event:messageCreate',
  EVENT_MESSAGE_DELETE: 'event:messageDelete',
  EVENT_MESSAGE_UPDATE: 'event:messageUpdate',
  EVENT_PRESENCE_UPDATE: 'event:presenceUpdate',
  EVENT_TYPING_START: 'event:typingStart',
  EVENT_VOICE_STATE_UPDATE: 'event:voiceStateUpdate',
  EVENT_CHANNEL_CREATE: 'event:channelCreate',
  EVENT_CHANNEL_DELETE: 'event:channelDelete',
  EVENT_RELATIONSHIP_CHANGE: 'event:relationshipChange',
  EVENT_LOGIN_STATUS: 'event:loginStatus',
  EVENT_CHAT_OPENED: 'event:chatOpened',
  PLAY_SOUND: 'play-sound',
} as const;
