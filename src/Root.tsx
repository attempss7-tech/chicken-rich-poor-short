import React from "react";
import { Composition } from "remotion";
import { ChickenShort, CHICKEN_FRAMES } from "./videos/chicken/Chicken";

export const Root: React.FC = () => (
  <Composition
    id="ChickenShort"
    component={ChickenShort}
    durationInFrames={CHICKEN_FRAMES}
    fps={30}
    width={540}
    height={960}
  />
);
