// Imported through Vite so models ship as hashed files under assets/, the only renderer path the packaged web client serves.
import bookcase from '../assets/models/furniture/bookcaseClosed.glb?url'
import chairDesk from '../assets/models/furniture/chairDesk.glb?url'
import computerScreen from '../assets/models/furniture/computerScreen.glb?url'
import desk from '../assets/models/furniture/desk.glb?url'
import lampRoundFloor from '../assets/models/furniture/lampRoundFloor.glb?url'
import laptop from '../assets/models/furniture/laptop.glb?url'
import loungeSofa from '../assets/models/furniture/loungeSofa.glb?url'
import plantSmall from '../assets/models/furniture/plantSmall1.glb?url'
import pottedPlant from '../assets/models/furniture/pottedPlant.glb?url'
import rugRound from '../assets/models/furniture/rugRound.glb?url'
import tableCoffee from '../assets/models/furniture/tableCoffee.glb?url'
import charFemaleA from '../assets/models/people/character-female-a.glb?url'
import charMaleA from '../assets/models/people/character-male-a.glb?url'
import robot from '../assets/models/robot.glb?url'

export const OFFICE_MODELS = {
  desk,
  chairDesk,
  computerScreen,
  laptop,
  plantSmall,
  pottedPlant,
  bookcase,
  lampRoundFloor,
  loungeSofa,
  tableCoffee,
  rugRound,
  charMaleA,
  charFemaleA,
  robot
} as const
