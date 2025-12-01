// src/illustrations/lab.js
const NS='http://www.w3.org/2000/svg';

export function createLabIllustration(){
  const svg=document.createElementNS(NS,'svg');
  svg.setAttribute('viewBox','0 0 1440 360');
  svg.setAttribute('class','illu illu-lab');
  svg.setAttribute('aria-hidden','true');

  // Defs for gradients and glows
  const defs=document.createElementNS(NS,'defs');

  // Animated green stripes gradient (user's favorite!)
  const stripePattern=document.createElementNS(NS,'pattern');
  stripePattern.setAttribute('id','greenStripes');
  stripePattern.setAttribute('patternUnits','userSpaceOnUse');
  stripePattern.setAttribute('width','8');
  stripePattern.setAttribute('height','360');
  for(let i=0; i<360; i+=30){
    const stripe=document.createElementNS(NS,'rect');
    stripe.setAttribute('x','0');
    stripe.setAttribute('y',String(i));
    stripe.setAttribute('width','8');
    stripe.setAttribute('height','20');
    stripe.setAttribute('fill','rgba(0, 255, 180, 0.15)');
    stripe.setAttribute('class','lab-stripe');
    stripe.style.animationDelay=`${i*0.01}s`;
    stripePattern.appendChild(stripe);
  }
  defs.appendChild(stripePattern);

  // Glow filter for 3D effect
  const glow=document.createElementNS(NS,'filter');
  glow.setAttribute('id','labGlow');
  const blur1=document.createElementNS(NS,'feGaussianBlur');
  blur1.setAttribute('stdDeviation','4');
  blur1.setAttribute('result','coloredBlur');
  const merge=document.createElementNS(NS,'feMerge');
  const node1=document.createElementNS(NS,'feMergeNode');
  node1.setAttribute('in','coloredBlur');
  const node2=document.createElementNS(NS,'feMergeNode');
  node2.setAttribute('in','SourceGraphic');
  merge.append(node1, node2);
  glow.append(blur1, merge);
  defs.appendChild(glow);

  // Colorful gradient for beaker liquid
  const liquidGrad=document.createElementNS(NS,'linearGradient');
  liquidGrad.setAttribute('id','liquidGradient');
  liquidGrad.setAttribute('x1','0%');
  liquidGrad.setAttribute('y1','0%');
  liquidGrad.setAttribute('x2','0%');
  liquidGrad.setAttribute('y2','100%');
  const liq1=document.createElementNS(NS,'stop');
  liq1.setAttribute('offset','0%');
  liq1.setAttribute('stop-color','#00ffcc');
  const liq2=document.createElementNS(NS,'stop');
  liq2.setAttribute('offset','100%');
  liq2.setAttribute('stop-color','#00ccff');
  liquidGrad.append(liq1, liq2);
  defs.appendChild(liquidGrad);

  // 3D bench gradient
  const benchGrad=document.createElementNS(NS,'linearGradient');
  benchGrad.setAttribute('id','benchGradient');
  benchGrad.setAttribute('x1','0%');
  benchGrad.setAttribute('y1','0%');
  benchGrad.setAttribute('x2','0%');
  benchGrad.setAttribute('y2','100%');
  const b1=document.createElementNS(NS,'stop');
  b1.setAttribute('offset','0%');
  b1.setAttribute('stop-color','#1a2530');
  const b2=document.createElementNS(NS,'stop');
  b2.setAttribute('offset','50%');
  b2.setAttribute('stop-color','#0b1116');
  const b3=document.createElementNS(NS,'stop');
  b3.setAttribute('offset','100%');
  b3.setAttribute('stop-color','#060a0d');
  benchGrad.append(b1, b2, b3);
  defs.appendChild(benchGrad);

  svg.appendChild(defs);

  // Animated green stripe background (user's favorite!)
  const stripesBg=document.createElementNS(NS,'rect');
  stripesBg.setAttribute('x','0');
  stripesBg.setAttribute('y','0');
  stripesBg.setAttribute('width','1440');
  stripesBg.setAttribute('height','360');
  stripesBg.setAttribute('fill','url(#greenStripes)');
  stripesBg.setAttribute('opacity','0.8');
  svg.appendChild(stripesBg);

  // Large glowing beaker (center) - MUCH BIGGER
  const beakerG=document.createElementNS(NS,'g');
  beakerG.setAttribute('transform','translate(620, 80)');
  beakerG.setAttribute('filter','url(#labGlow)');

  // Scientific beaker with clear glass appearance
  const beaker=document.createElementNS(NS,'path');
  // Classic beaker shape: wide top rim, slightly tapered body, flat bottom
  beaker.setAttribute('d','M40 10 L160 10 L160 15 L155 15 L150 185 L145 195 L55 195 L50 185 L45 15 L40 15 Z');
  beaker.setAttribute('fill','rgba(77, 255, 255, 0.05)');
  beaker.setAttribute('stroke','#4dffff');
  beaker.setAttribute('stroke-width','4');
  beaker.setAttribute('opacity','1');
  beakerG.appendChild(beaker);

  // Glass rim highlight for 3D effect
  const rim=document.createElementNS(NS,'rect');
  rim.setAttribute('x','40');
  rim.setAttribute('y','10');
  rim.setAttribute('width','120');
  rim.setAttribute('height','5');
  rim.setAttribute('fill','rgba(77, 255, 255, 0.4)');
  rim.setAttribute('rx','2');
  beakerG.appendChild(rim);

  // Glowing liquid inside - wider to match beaker walls
  const liquid=document.createElementNS(NS,'rect');
  liquid.setAttribute('x','48');
  liquid.setAttribute('y','120');
  liquid.setAttribute('width','106');
  liquid.setAttribute('height','75');
  liquid.setAttribute('rx','8');
  liquid.setAttribute('fill','url(#liquidGradient)');
  liquid.setAttribute('opacity','0.7');
  liquid.setAttribute('class','lab-liquid-glow');
  beakerG.appendChild(liquid);

  // Bubbles
  for(let i=0; i<12; i++){
    const b=document.createElementNS(NS,'circle');
    b.setAttribute('cx',String(70+Math.random()*60));
    b.setAttribute('cy',String(190));
    b.setAttribute('r',String(3+Math.random()*4));
    b.setAttribute('fill','rgba(100, 255, 255, 0.8)');
    b.setAttribute('class','lab-bubble');
    b.setAttribute('filter','url(#labGlow)');
    b.style.animationDelay=`${i*0.2}s`;
    beakerG.appendChild(b);
  }

  svg.appendChild(beakerG);

  // Glowing 3D molecules - LARGER
  function createGlowingMolecule(cx, cy, color, delay) {
    const g=document.createElementNS(NS,'g');
    g.setAttribute('class','lab-molecule');
    g.setAttribute('filter','url(#labGlow)');
    g.style.animationDelay=`${delay}s`;

    // Center atom - BIGGER
    const center=document.createElementNS(NS,'circle');
    center.setAttribute('cx',String(cx));
    center.setAttribute('cy',String(cy));
    center.setAttribute('r','12');
    center.setAttribute('fill',color);
    center.setAttribute('opacity','0.9');
    g.appendChild(center);

    // Orbiting atoms
    [0, 120, 240].forEach(angle=>{
      const rad=angle*Math.PI/180;
      const x=cx+Math.cos(rad)*35;
      const y=cy+Math.sin(rad)*35;

      // Bond line - glowing
      const bond=document.createElementNS(NS,'line');
      bond.setAttribute('x1',String(cx));
      bond.setAttribute('y1',String(cy));
      bond.setAttribute('x2',String(x));
      bond.setAttribute('y2',String(y));
      bond.setAttribute('stroke',color);
      bond.setAttribute('stroke-width','2');
      bond.setAttribute('opacity','0.6');
      g.appendChild(bond);

      // Orbit atom - BIGGER
      const atom=document.createElementNS(NS,'circle');
      atom.setAttribute('cx',String(x));
      atom.setAttribute('cy',String(y));
      atom.setAttribute('r','8');
      atom.setAttribute('fill',color);
      atom.setAttribute('opacity','0.85');
      g.appendChild(atom);
    });

    return g;
  }

  // Add colorful glowing molecules
  svg.appendChild(createGlowingMolecule(180, 100, '#ff66ff', 0));     // Magenta
  svg.appendChild(createGlowingMolecule(1260, 120, '#66ffff', 1.5));  // Cyan
  svg.appendChild(createGlowingMolecule(300, 220, '#ffff66', 0.8));   // Yellow

  // Glowing DNA helix - LARGER
  function createGlowingDNA(startX, startY, color) {
    const g=document.createElementNS(NS,'g');
    g.setAttribute('class','lab-dna');
    g.setAttribute('filter','url(#labGlow)');

    for(let i=0; i<8; i++){
      const y=startY+i*18;
      const offset=Math.sin(i*0.6)*15;

      // Spine - BIGGER
      const s1=document.createElementNS(NS,'circle');
      s1.setAttribute('cx',String(startX+offset));
      s1.setAttribute('cy',String(y));
      s1.setAttribute('r','4');
      s1.setAttribute('fill',color);
      s1.setAttribute('opacity','0.9');
      g.appendChild(s1);

      const s2=document.createElementNS(NS,'circle');
      s2.setAttribute('cx',String(startX-offset));
      s2.setAttribute('cy',String(y));
      s2.setAttribute('r','4');
      s2.setAttribute('fill',color);
      s2.setAttribute('opacity','0.9');
      g.appendChild(s2);

      // Connecting pair - glowing
      const pair=document.createElementNS(NS,'line');
      pair.setAttribute('x1',String(startX+offset));
      pair.setAttribute('y1',String(y));
      pair.setAttribute('x2',String(startX-offset));
      pair.setAttribute('y2',String(y));
      pair.setAttribute('stroke',color);
      pair.setAttribute('stroke-width','2');
      pair.setAttribute('opacity','0.7');
      g.appendChild(pair);
    }

    return g;
  }

  svg.appendChild(createGlowingDNA(450, 60, '#ff6699'));    // Pink
  svg.appendChild(createGlowingDNA(990, 80, '#66ff99'));     // Green

  // MICROSCOPE - recognizable lab equipment!
  const microscope=document.createElementNS(NS,'g');
  microscope.setAttribute('transform','translate(1080, 180)');
  microscope.setAttribute('filter','url(#labGlow)');

  // Base
  const base=document.createElementNS(NS,'ellipse');
  base.setAttribute('cx','50');
  base.setAttribute('cy','115');
  base.setAttribute('rx','45');
  base.setAttribute('ry','8');
  base.setAttribute('fill','#555');
  microscope.appendChild(base);

  // Arm/Stand
  const stand=document.createElementNS(NS,'rect');
  stand.setAttribute('x','45');
  stand.setAttribute('y','35');
  stand.setAttribute('width','10');
  stand.setAttribute('height','80');
  stand.setAttribute('fill','#666');
  microscope.appendChild(stand);

  // Stage (sample platform)
  const stage=document.createElementNS(NS,'rect');
  stage.setAttribute('x','25');
  stage.setAttribute('y','70');
  stage.setAttribute('width','50');
  stage.setAttribute('height','5');
  stage.setAttribute('fill','#777');
  microscope.appendChild(stage);

  // Body tube
  const tube=document.createElementNS(NS,'rect');
  tube.setAttribute('x','42');
  tube.setAttribute('y','10');
  tube.setAttribute('width','16');
  tube.setAttribute('height','30');
  tube.setAttribute('fill','#555');
  tube.setAttribute('rx','2');
  microscope.appendChild(tube);

  // Eyepiece (top)
  const eyepiece=document.createElementNS(NS,'circle');
  eyepiece.setAttribute('cx','50');
  eyepiece.setAttribute('cy','8');
  eyepiece.setAttribute('r','6');
  eyepiece.setAttribute('fill','#333');
  eyepiece.setAttribute('stroke','#66ffff');
  eyepiece.setAttribute('stroke-width','2');
  microscope.appendChild(eyepiece);

  // Objective lens (bottom) - glowing
  const objective=document.createElementNS(NS,'circle');
  objective.setAttribute('cx','50');
  objective.setAttribute('cy','42');
  objective.setAttribute('r','7');
  objective.setAttribute('fill','#444');
  objective.setAttribute('stroke','#ff66ff');
  objective.setAttribute('stroke-width','2');
  microscope.appendChild(objective);

  // Light beam from microscope - glowing
  const microBeam=document.createElementNS(NS,'polygon');
  microBeam.setAttribute('points','45,75 55,75 60,90 40,90');
  microBeam.setAttribute('fill','rgba(255, 235, 150, 0.5)');
  microBeam.setAttribute('class','lab-micro-light');
  microscope.appendChild(microBeam);

  svg.appendChild(microscope);

  // Glowing floating particles - LARGER
  for(let i=0; i<20; i++){
    const p=document.createElementNS(NS,'circle');
    p.setAttribute('cx',String(50+Math.random()*1340));
    p.setAttribute('cy',String(20+Math.random()*280));
    p.setAttribute('r',String(3+Math.random()*3));
    const colors=['#ff66ff', '#66ffff', '#ffff66', '#ff6699', '#66ff99'];
    p.setAttribute('fill',colors[Math.floor(Math.random()*colors.length)]);
    p.setAttribute('class','lab-particle');
    p.setAttribute('filter','url(#labGlow)');
    p.style.animationDelay=`${Math.random()*4}s`;
    svg.appendChild(p);
  }

  // Lab bench removed - was extending beyond viewBox and causing extra space

  return svg;
}

// installLabParallax() removed - was empty function (cleanup Dec 2025)
