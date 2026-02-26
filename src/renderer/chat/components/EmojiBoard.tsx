import React, { useState, useCallback } from 'react';
import { assetUrl } from '../../shared/hooks/useAssets';

interface EmojiBoardProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (emojiCode: string) => void;
}

const EMOJI_LIST: Array<{ file: string; code: string; name: string }> = [
  { file: 'Smile.png', code: ':smile:', name: 'Smile' },
  { file: 'Grin.png', code: ':grin:', name: 'Grin' },
  { file: 'Wink.png', code: ':wink:', name: 'Wink' },
  { file: 'Tongue.png', code: ':stuck_out_tongue:', name: 'Tongue' },
  { file: 'Surprised.png', code: ':open_mouth:', name: 'Surprised' },
  { file: 'Surprise.png', code: ':astonished:', name: 'Astonished' },
  { file: 'Frown.png', code: ':frowning:', name: 'Frown' },
  { file: 'Sob.png', code: ':sob:', name: 'Sob' },
  { file: 'Rage.png', code: ':rage:', name: 'Rage' },
  { file: 'Anger.png', code: ':angry:', name: 'Anger' },
  { file: 'Confused.png', code: ':confused:', name: 'Confused' },
  { file: 'Flushed.png', code: ':flushed:', name: 'Flushed' },
  { file: 'Sunglasses.png', code: ':sunglasses:', name: 'Sunglasses' },
  { file: 'Nerd.png', code: ':nerd:', name: 'Nerd' },
  { file: 'Thinking.png', code: ':thinking:', name: 'Thinking' },
  { file: 'RollingEyes.png', code: ':rolling_eyes:', name: 'Rolling Eyes' },
  { file: 'Sick.png', code: ':nauseated_face:', name: 'Sick' },
  { file: 'Yawn.png', code: ':yawning_face:', name: 'Yawn' },
  { file: 'ZipMouth.png', code: ':zipper_mouth:', name: 'Zip Mouth' },
  { file: 'LipBite.png', code: ':face_with_open_eyes_and_hand_over_mouth:', name: 'Lip Bite' },
  { file: 'Discontent.png', code: ':unamused:', name: 'Discontent' },
  { file: 'WTF.png', code: ':face_with_raised_eyebrow:', name: 'WTF' },
  { file: 'Angel.png', code: ':innocent:', name: 'Angel' },
  { file: 'Demon.png', code: ':smiling_imp:', name: 'Demon' },
  { file: 'Party.png', code: ':partying_face:', name: 'Party' },
  { file: 'CrossedFingers.png', code: ':crossed_fingers:', name: 'Crossed Fingers' },
  { file: 'ThumbsUp.png', code: ':thumbsup:', name: 'Thumbs Up' },
  { file: 'ThumbsDown.png', code: ':thumbsdown:', name: 'Thumbs Down' },
  { file: 'HighFive.png', code: ':raised_hand:', name: 'High Five' },
  { file: 'Heart.png', code: ':heart:', name: 'Heart' },
  { file: 'BrokenHeart.png', code: ':broken_heart:', name: 'Broken Heart' },
  { file: 'Rose.png', code: ':rose:', name: 'Rose' },
  { file: 'Rose_Wilter.png', code: ':wilted_rose:', name: 'Wilted Rose' },
  { file: 'Star.png', code: ':star:', name: 'Star' },
  { file: 'Sun.png', code: ':sunny:', name: 'Sun' },
  { file: 'Moon.png', code: ':crescent_moon:', name: 'Moon' },
  { file: 'Rainbow.png', code: ':rainbow:', name: 'Rainbow' },
  { file: 'Rain.png', code: ':cloud_rain:', name: 'Rain' },
  { file: 'Thunder.png', code: ':thunder_cloud_rain:', name: 'Thunder' },
  { file: 'Umbrella.png', code: ':umbrella:', name: 'Umbrella' },
  { file: 'Cat.png', code: ':cat:', name: 'Cat' },
  { file: 'Dog.png', code: ':dog:', name: 'Dog' },
  { file: 'Rabbit.png', code: ':rabbit:', name: 'Rabbit' },
  { file: 'Bat.png', code: ':bat:', name: 'Bat' },
  { file: 'Goat.png', code: ':goat:', name: 'Goat' },
  { file: 'Sheep.png', code: ':sheep:', name: 'Sheep' },
  { file: 'Snail.png', code: ':snail:', name: 'Snail' },
  { file: 'Tortoise.png', code: ':turtle:', name: 'Tortoise' },
  { file: 'Pizza.png', code: ':pizza:', name: 'Pizza' },
  { file: 'Cake.png', code: ':cake:', name: 'Cake' },
  { file: 'Coffee.png', code: ':coffee:', name: 'Coffee' },
  { file: 'Beer.png', code: ':beer:', name: 'Beer' },
  { file: 'Wine.png', code: ':wine_glass:', name: 'Wine' },
  { file: 'Soup.png', code: ':bowl_with_spoon:', name: 'Soup' },
  { file: 'Present.png', code: ':gift:', name: 'Present' },
  { file: 'Football.png', code: ':football:', name: 'Football' },
  { file: 'SoccerBall.png', code: ':soccer:', name: 'Soccer Ball' },
  { file: 'Music.png', code: ':musical_note:', name: 'Music' },
  { file: 'Camera.png', code: ':camera:', name: 'Camera' },
  { file: 'Film.png', code: ':film_frames:', name: 'Film' },
  { file: 'Computer.png', code: ':computer:', name: 'Computer' },
  { file: 'Phone.png', code: ':telephone:', name: 'Phone' },
  { file: 'CellPhone.png', code: ':mobile_phone:', name: 'Cell Phone' },
  { file: 'Mail.png', code: ':envelope:', name: 'Mail' },
  { file: 'LightBulb.png', code: ':bulb:', name: 'Light Bulb' },
  { file: 'Car.png', code: ':red_car:', name: 'Car' },
  { file: 'Plane.png', code: ':airplane:', name: 'Plane' },
  { file: 'Clock.png', code: ':clock3:', name: 'Clock' },
  { file: 'Currency.png', code: ':dollar:', name: 'Currency' },
  { file: 'Cigarette.png', code: ':smoking:', name: 'Cigarette' },
  { file: 'Man.png', code: ':man_standing:', name: 'Man' },
  { file: 'Woman.png', code: ':woman_standing:', name: 'Woman' },
  { file: 'Jump.png', code: ':person_doing_cartwheel:', name: 'Jump' },
  { file: 'Beach.png', code: ':beach_umbrella:', name: 'Beach' },
  { file: 'Plate.png', code: ':plate_with_cutlery:', name: 'Plate' },
  { file: 'Xbox.png', code: ':video_game:', name: 'Xbox' },
  { file: 'Cuffs.png', code: ':chains:', name: 'Cuffs' },
  { file: 'ReachLeft.png', code: ':point_left:', name: 'Reach Left' },
  { file: 'ReachRight.png', code: ':point_right:', name: 'Reach Right' },
  { file: 'Conversation.png', code: ':speech_balloon:', name: 'Conversation' },
  { file: 'WLM.png', code: ':wave:', name: 'WLM' },
];

export const EmojiBoard: React.FC<EmojiBoardProps> = ({ visible, onClose, onSelect }) => {
  const [hoveredEmoji, setHoveredEmoji] = useState<string | null>(null);

  const handleSelect = useCallback((code: string) => {
    onSelect(code);
  }, [onSelect]);

  if (!visible) return null;

  return (
    <>
      <div className="emoji-board-overlay" onClick={onClose} />
      <div className="emoji-board">
        <div className="emoji-board-header">
          <span className="emoji-board-title">Your emoticons</span>
        </div>
        <div className="emoji-board-grid">
          {EMOJI_LIST.map(emoji => (
            <button
              key={emoji.file}
              className="emoji-board-item"
              onClick={() => handleSelect(emoji.code)}
              onMouseEnter={() => setHoveredEmoji(emoji.name)}
              onMouseLeave={() => setHoveredEmoji(null)}
              title={emoji.name}
            >
              <img src={assetUrl('images', 'emoji', emoji.file)} alt={emoji.name} draggable={false} />
            </button>
          ))}
        </div>
        <div className="emoji-board-status">{hoveredEmoji ?? '\u00A0'}</div>
      </div>
    </>
  );
};
