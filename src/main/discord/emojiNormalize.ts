/**
 * Maps Unicode emoji (as sent by Discord) to our shortcode form so the renderer
 * can replace them with our emoji picker images. Discord sends Unicode emoji in
 * message content; we normalize to :code: so one code path handles both.
 */
const UNICODE_TO_SHORTCODE: Record<string, string> = {
  '\u{1F600}': ':grin:',
  '\u{1F603}': ':smile:',
  '\u{1F604}': ':smile:',
  '\u{1F609}': ':wink:',
  '\u{1F61C}': ':wink:',
  '\u{1F61B}': ':stuck_out_tongue:',
  '\u{1F62E}': ':open_mouth:',
  '\u{1F632}': ':astonished:',
  '\u{2639}': ':frowning:',
  '\u{1F641}': ':frowning:',
  '\u{1F62D}': ':sob:',
  '\u{1F621}': ':rage:',
  '\u{1F620}': ':angry:',
  '\u{1F615}': ':confused:',
  '\u{1F633}': ':flushed:',
  '\u{1F60E}': ':sunglasses:',
  '\u{1F913}': ':nerd:',
  '\u{1F914}': ':thinking:',
  '\u{1F644}': ':rolling_eyes:',
  '\u{1F922}': ':nauseated_face:',
  '\u{1F631}': ':astonished:',
  '\u{1F928}': ':face_with_raised_eyebrow:',
  '\u{1F61E}': ':unamused:',
  '\u{1F607}': ':innocent:',
  '\u{1F608}': ':smiling_imp:',
  '\u{1F973}': ':partying_face:',
  '\u{1F91E}': ':crossed_fingers:',
  '\u{1F44D}': ':thumbsup:',
  '\u{1F44E}': ':thumbsdown:',
  '\u{270B}': ':raised_hand:',
  '\u{1F91D}': ':raised_hand:',
  '\u{2764}': ':heart:',
  '\u{1F494}': ':broken_heart:',
  '\u{1F339}': ':rose:',
  '\u{2B50}': ':star:',
  '\u{2600}': ':sunny:',
  '\u{1F31B}': ':crescent_moon:',
  '\u{1F308}': ':rainbow:',
  '\u{1F327}': ':cloud_rain:',
  '\u{26C8}': ':thunder_cloud_rain:',
  '\u{2602}': ':umbrella:',
  '\u{1F302}': ':umbrella:',
  '\u{1F408}': ':cat:',
  '\u{1F415}': ':dog:',
  '\u{1F407}': ':rabbit:',
  '\u{1F987}': ':bat:',
  '\u{1F410}': ':goat:',
  '\u{1F411}': ':sheep:',
  '\u{1F40C}': ':snail:',
  '\u{1F422}': ':turtle:',
  '\u{1F355}': ':pizza:',
  '\u{1F382}': ':cake:',
  '\u{2615}': ':coffee:',
  '\u{1F37A}': ':beer:',
  '\u{1F377}': ':wine_glass:',
  '\u{1F963}': ':bowl_with_spoon:',
  '\u{1F381}': ':gift:',
  '\u{1F3C8}': ':football:',
  '\u{26BD}': ':soccer:',
  '\u{1F3B5}': ':musical_note:',
  '\u{1F4F7}': ':camera:',
  '\u{1F39E}': ':film_frames:',
  '\u{1F4BB}': ':computer:',
  '\u{260E}': ':telephone:',
  '\u{1F4F1}': ':mobile_phone:',
  '\u{2709}': ':envelope:',
  '\u{1F4A1}': ':bulb:',
  '\u{1F697}': ':red_car:',
  '\u{2708}': ':airplane:',
  '\u{1F552}': ':clock3:',
  '\u{1F4B5}': ':dollar:',
  '\u{1F6AC}': ':smoking:',
  '\u{1F46E}': ':man_standing:',
  '\u{1F46F}': ':woman_standing:',
  '\u{1F938}': ':person_doing_cartwheel:',
  '\u{26F1}': ':beach_umbrella:',
  '\u{1F37D}': ':plate_with_cutlery:',
  '\u{1F3AE}': ':video_game:',
  '\u{26D3}': ':chains:',
  '\u{1F448}': ':point_left:',
  '\u{1F449}': ':point_right:',
  '\u{1F4AC}': ':speech_balloon:',
  '\u{1F44B}': ':wave:',
};

/** Build a list of (unicode string, shortcode) sorted by unicode length descending for greedy match */
const SORTED_ENTRIES = (() => {
  const arr = Object.entries(UNICODE_TO_SHORTCODE);
  arr.sort((a, b) => b[0].length - a[0].length);
  return arr;
})();

/**
 * Replace Unicode emoji in message content with :shortcode: so the renderer
 * can consistently replace with our emoji picker images.
 */
export function normalizeEmojiInContent(content: string): string {
  if (!content || typeof content !== 'string') return content;
  let result = content;
  for (const [unicode, shortcode] of SORTED_ENTRIES) {
    result = result.split(unicode).join(shortcode);
  }
  return result;
}
