import React from "react";
import { Composition } from "remotion";
import { CaptionsComposition } from "./CaptionsComposition";

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="CaptionsComposition"
        component={CaptionsComposition}
        durationInFrames={300} // Default 10s @ 30fps; overridden dynamically by inputProps
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          videoUrl: "",
          segments: [],
          style: {
            fontFamily: "Montserrat",
            fontSize: 48,
            textColor: "#FFFFFF",
            highlightColor: "#000000",
            highlightBg: "#FFE600",
            highlightMode: "pill",
            strokeColor: "#000000",
            strokeWidth: 0,
            animationStyle: "pop",
            positionY: 78,
          },
        }}
      />
    </>
  );
};

export default RemotionRoot;
