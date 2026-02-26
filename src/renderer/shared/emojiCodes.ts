/**
 * Emoji shortcode → image filename mapping (matches EmojiBoard / Discord codes).
 * Used for rendering :code: in chat as our picker images.
 */
export const EMOJI_CODE_TO_FILE: Record<string, string> = {
  ':smile:': 'Smile.png',
  ':grin:': 'Grin.png',
  ':wink:': 'Wink.png',
  ':stuck_out_tongue:': 'Tongue.png',
  ':open_mouth:': 'Surprised.png',
  ':astonished:': 'Surprise.png',
  ':frowning:': 'Frown.png',
  ':sob:': 'Sob.png',
  ':rage:': 'Rage.png',
  ':angry:': 'Anger.png',
  ':confused:': 'Confused.png',
  ':flushed:': 'Flushed.png',
  ':sunglasses:': 'Sunglasses.png',
  ':nerd:': 'Nerd.png',
  ':thinking:': 'Thinking.png',
  ':rolling_eyes:': 'RollingEyes.png',
  ':nauseated_face:': 'Sick.png',
  ':yawning_face:': 'Yawn.png',
  ':zipper_mouth:': 'ZipMouth.png',
  ':face_with_open_eyes_and_hand_over_mouth:': 'LipBite.png',
  ':unamused:': 'Discontent.png',
  ':face_with_raised_eyebrow:': 'WTF.png',
  ':innocent:': 'Angel.png',
  ':smiling_imp:': 'Demon.png',
  ':partying_face:': 'Party.png',
  ':crossed_fingers:': 'CrossedFingers.png',
  ':thumbsup:': 'ThumbsUp.png',
  ':thumbsdown:': 'ThumbsDown.png',
  ':raised_hand:': 'HighFive.png',
  ':heart:': 'Heart.png',
  ':broken_heart:': 'BrokenHeart.png',
  ':rose:': 'Rose.png',
  ':wilted_rose:': 'Rose_Wilter.png',
  ':star:': 'Star.png',
  ':sunny:': 'Sun.png',
  ':crescent_moon:': 'Moon.png',
  ':rainbow:': 'Rainbow.png',
  ':cloud_rain:': 'Rain.png',
  ':thunder_cloud_rain:': 'Thunder.png',
  ':umbrella:': 'Umbrella.png',
  ':cat:': 'Cat.png',
  ':dog:': 'Dog.png',
  ':rabbit:': 'Rabbit.png',
  ':bat:': 'Bat.png',
  ':goat:': 'Goat.png',
  ':sheep:': 'Sheep.png',
  ':snail:': 'Snail.png',
  ':turtle:': 'Tortoise.png',
  ':pizza:': 'Pizza.png',
  ':cake:': 'Cake.png',
  ':coffee:': 'Coffee.png',
  ':beer:': 'Beer.png',
  ':wine_glass:': 'Wine.png',
  ':bowl_with_spoon:': 'Soup.png',
  ':gift:': 'Present.png',
  ':football:': 'Football.png',
  ':soccer:': 'SoccerBall.png',
  ':musical_note:': 'Music.png',
  ':camera:': 'Camera.png',
  ':film_frames:': 'Film.png',
  ':computer:': 'Computer.png',
  ':telephone:': 'Phone.png',
  ':mobile_phone:': 'CellPhone.png',
  ':envelope:': 'Mail.png',
  ':bulb:': 'LightBulb.png',
  ':red_car:': 'Car.png',
  ':airplane:': 'Plane.png',
  ':clock3:': 'Clock.png',
  ':dollar:': 'Currency.png',
  ':smoking:': 'Cigarette.png',
  ':man_standing:': 'Man.png',
  ':woman_standing:': 'Woman.png',
  ':person_doing_cartwheel:': 'Jump.png',
  ':beach_umbrella:': 'Beach.png',
  ':plate_with_cutlery:': 'Plate.png',
  ':video_game:': 'Xbox.png',
  ':chains:': 'Cuffs.png',
  ':point_left:': 'ReachLeft.png',
  ':point_right:': 'ReachRight.png',
  ':speech_balloon:': 'Conversation.png',
  ':wave:': 'WLM.png',
};

/** Regex to match Discord-style emoji shortcodes :word: (word = letters, numbers, underscores) */
const EMOJI_CODE_REGEX = /:[a-z0-9_]+:/g;

/**
 * Split content by emoji codes and return segments (text or code).
 */
export function splitByEmojiCodes(content: string): { type: 'text' | 'emoji'; value: string }[] {
  const segments: { type: 'text' | 'emoji'; value: string }[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  EMOJI_CODE_REGEX.lastIndex = 0;
  while ((m = EMOJI_CODE_REGEX.exec(content)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ type: 'text', value: content.slice(lastIndex, m.index) });
    }
    segments.push({ type: 'emoji', value: m[0] });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < content.length) {
    segments.push({ type: 'text', value: content.slice(lastIndex) });
  }
  return segments.length > 0 ? segments : [{ type: 'text', value: content }];
}

export function getEmojiFileForCode(code: string): string | undefined {
  return EMOJI_CODE_TO_FILE[code];
}
