import { useEffect, useRef } from "react";
import digital from "../assets/visuals/event-digital.svg";
import culture from "../assets/visuals/event-culture.svg";
import university from "../assets/visuals/event-campus.svg";

// Editorial illustrations selected from real event metadata, never event photographs.
export function Artwork({
  category = "", title = "", organizer = "", campus = false, className = "",
}) {
  const meaning = `${category} ${title} ${organizer}`
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  let illustration = null;
  if (/culture|artist|musique/.test(meaning)) illustration = culture;
  else if (/technolog|informatique|atelier|workshop|formation|\bweb\b|numerique/.test(meaning)) illustration = digital;
  else if (/campus|institution|universit/.test(meaning)) illustration = university;
  if (!campus && illustration) {
    return (
      <img src={illustration} className={`artwork designed-event-art ${className}`}
        alt="" aria-hidden="true" />
    );
  }
  return <CategoryArtwork category={category} campus={campus} className={className} />;
}

function CategoryArtwork({ category, campus, className }) {
  const ref = useRef(null);
  useEffect(() => {
    const ctx = ref.current.getContext("2d");
    const w = 800,
      h = 360;
    const rect = (x, y, width, height, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, width, height);
    };
    const circle = (x, y, r, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };
    const round = (x, y, width, height, r, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, r);
      ctx.fill();
    };
    ctx.clearRect(0, 0, w, h);
    const type = category.toLocaleLowerCase("fr");
    if (campus || /club|culture|sport|associ/.test(type)) {
      rect(0, 0, w, h, "#a5d5e9");
      rect(0, 310, w, 50, "#8bb888");
      rect(65, 126, 665, 190, "#f1e7d6");
      rect(42, 112, 710, 16, "#607d8d");
      for (let x = 102; x < 700; x += 57) rect(x, 137, 36, 145, "#78aec3");
      rect(361, 210, 99, 106, "#3d657d");
      if (campus) {
        rect(682, 77, 17, 236, "#796b58");
        circle(650, 53, 69, "#317c60");
        circle(721, 58, 76, "#317c60");
        circle(784, 45, 70, "#317c60");
      } else {
        for (let i = 0; i < 10; i++) {
          const x = 40 + i * 80;
          circle(x, 265 + (i % 2) * 8, 15, "#dcae8e");
          round(
            x - 23,
            281 + (i % 2) * 8,
            46,
            71,
            12,
            ["#4282bd", "#efc85f", "#df7377", "#44978a"][i % 4],
          );
        }
      }
    } else if (/atelier|workshop|formation/.test(type)) {
      rect(0, 0, w, h, "#afd8e5");
      rect(0, 246, w, 114, "#d2b18f");
      for (let i = 0; i < 3; i++) {
        const x = 145 + i * 260;
        circle(x, 55, 28, "#ce9c7c");
        round(x - 51, 82, 102, 95, 26, ["#587eb0", "#f4c557", "#587eb0"][i]);
        round(x - 76, 142, 152, 100, 9, "#285a74");
        rect(x - 62, 154, 124, 76, "#4c9fc7");
        round(x - 89, 240, 178, 17, 5, "#e5edf0");
      }
    } else {
      rect(0, 0, w, h, "#18365f");
      round(188, 26, 425, 218, 9, "#3c73c8");
      rect(232, 43, 335, 181, "#81b1f4");
      circle(137, 129, 25, "#dfab87");
      round(101, 154, 76, 116, 20, "#29364c");
      rect(0, 294, w, 66, "#284a76");
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = ["#345684", "#203957", "#19304e"][i % 3];
        ctx.beginPath();
        ctx.ellipse(i * 99 + 40, 330 + (i % 2) * 12, 48, 39, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [category, campus]);
  return (
    <canvas
      ref={ref}
      width="800"
      height="360"
      className={`artwork ${className}`}
      aria-hidden="true"
    />
  );
}
