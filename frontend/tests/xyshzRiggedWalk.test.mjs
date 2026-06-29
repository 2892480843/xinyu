import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readGlbJson(filePath) {
  const { json } = await readGlb(filePath);
  return json;
}

async function readGlb(filePath) {
  const bytes = await readFile(filePath);
  assert.equal(bytes.toString("utf8", 0, 4), "glTF", "expected a binary glTF file");

  let offset = 12;
  let json = null;
  let bin = null;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.toString("utf8", offset + 4, offset + 8);
    offset += 8;

    if (type === "JSON") {
      json = JSON.parse(bytes.toString("utf8", offset, offset + length).trim());
    } else if (type === "BIN\0") {
      bin = bytes.subarray(offset, offset + length);
    }
    offset += length;
  }

  assert.ok(json, "GLB JSON chunk not found");
  assert.ok(bin, "GLB BIN chunk not found");
  return { json, bin };
}

function accessorRows(gltf, bin, accessorIndex) {
  const accessor = gltf.accessors[accessorIndex];
  const view = gltf.bufferViews[accessor.bufferView];
  const component = {
    5126: { size: 4, read: (offset) => bin.readFloatLE(offset) },
  }[accessor.componentType];
  const dimensions = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[accessor.type];
  assert.ok(component, `unsupported accessor component type ${accessor.componentType}`);
  assert.ok(dimensions, `unsupported accessor type ${accessor.type}`);

  const stride = view.byteStride ?? dimensions * component.size;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const rows = [];
  for (let i = 0; i < accessor.count; i += 1) {
    const row = [];
    for (let d = 0; d < dimensions; d += 1) {
      row.push(component.read(start + i * stride + d * component.size));
    }
    rows.push(row);
  }
  return rows;
}

function quaternionDeltaRadians(a, b) {
  const al = Math.hypot(...a) || 1;
  const bl = Math.hypot(...b) || 1;
  const dot = Math.abs(a.reduce((sum, value, index) => sum + (value / al) * (b[index] / bl), 0));
  return 2 * Math.acos(Math.min(1, dot));
}

function maxRotationDeltaDegrees(values) {
  const base = values[0];
  return Math.max(...values.map((value) => quaternionDeltaRadians(base, value))) * 180 / Math.PI;
}

function maxTranslationDelta(values) {
  const base = values[0];
  return Math.max(...values.map((value) => Math.hypot(value[0] - base[0], value[1] - base[1], value[2] - base[2])));
}

async function loadRiggedGltfScene() {
  globalThis.self = globalThis;
  const THREE = await import("three");
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const bytes = await readFile(path.resolve("public/models/xyshz_rigged.glb"));
  const previousError = console.error;
  console.error = (...args) => {
    if (String(args[0] ?? "").includes("THREE.GLTFLoader: Couldn't load texture")) return;
    previousError(...args);
  };
  try {
    const gltf = await new Promise((resolve, reject) => {
      new GLTFLoader().parse(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        "",
        resolve,
        reject,
      );
    });
    return { THREE, gltf };
  } finally {
    console.error = previousError;
  }
}

function axisRange(points, axis) {
  const values = points.map((point) => point[axis]);
  return Math.max(...values) - Math.min(...values);
}

function findClip(gltf, name) {
  const clip = (gltf.animations ?? []).find((animation) => animation.name === name);
  assert.ok(clip, `missing ${name} animation`);
  return clip;
}

function findNodeIndex(gltf, name) {
  const index = gltf.nodes.findIndex((node) => node.name === name);
  assert.notEqual(index, -1, `missing node ${name}`);
  return index;
}

function rotationDeltaForClip(gltf, bin, clip, nodeName) {
  const nodeIndex = findNodeIndex(gltf, nodeName);
  const channel = clip.channels.find((candidate) => candidate.target.node === nodeIndex && candidate.target.path === "rotation");
  assert.ok(channel, `missing ${nodeName} rotation channel in ${clip.name}`);
  const values = accessorRows(gltf, bin, clip.samplers[channel.sampler].output);
  return maxRotationDeltaDegrees(values);
}

function sampleWorldPositions(THREE, gltf, clip, objectNames, sampleCount = 17) {
  const mixer = new THREE.AnimationMixer(gltf.scene);
  mixer.clipAction(clip).play();
  const samples = Object.fromEntries(objectNames.map((name) => [name, []]));

  for (let i = 0; i < sampleCount; i += 1) {
    mixer.setTime(clip.duration * (i / sampleCount));
    gltf.scene.updateMatrixWorld(true);
    for (const objectName of objectNames) {
      const object = gltf.scene.getObjectByName(objectName);
      assert.ok(object, `missing ${objectName}`);
      const pos = new THREE.Vector3();
      object.getWorldPosition(pos);
      samples[objectName].push([pos.x, pos.y, pos.z]);
    }
  }

  return samples;
}

async function readRigScript() {
  return readFile(path.resolve("../blender/xyshz_rigged_walk.py"), "utf8");
}

test("xyshz rigged GLB exports the playable skeleton and walk clips", async () => {
  const gltf = await readGlbJson(path.resolve("public/models/xyshz_rigged.glb"));
  const nodeNames = new Set((gltf.nodes ?? []).map((node) => node.name).filter(Boolean));
  const clipNames = new Set((gltf.animations ?? []).map((animation) => animation.name).filter(Boolean));

  for (const clip of ["Idle", "WalkLoop", "RunLoop"]) {
    assert.ok(clipNames.has(clip), `missing xyshz animation clip ${clip}`);
  }

  for (const node of [
    "XYSHZ_Rig",
    "Hips",
    "Spine",
    "Chest",
    "Head",
    "UpperLegL",
    "LowerLegL",
    "FootL",
    "UpperLegR",
    "LowerLegR",
    "FootR",
    "UpperArmL",
    "ForeArmL",
    "HandL",
    "UpperArmR",
    "ForeArmR",
    "HandR",
  ]) {
    assert.ok(nodeNames.has(node), `missing rig node ${node}`);
  }

  assert.ok((gltf.skins ?? []).length > 0, "expected at least one glTF skin");
  assert.ok(
    (gltf.meshes ?? []).some((mesh) =>
      (mesh.primitives ?? []).some((primitive) =>
        primitive.attributes?.JOINTS_0 !== undefined &&
        primitive.attributes?.WEIGHTS_0 !== undefined,
      ),
    ),
    "expected skinned mesh attributes JOINTS_0 and WEIGHTS_0",
  );
});

test("xyshz rigged GLB exports the complete protagonist action library", async () => {
  const gltf = await readGlbJson(path.resolve("public/models/xyshz_rigged.glb"));
  const clipNames = new Set((gltf.animations ?? []).map((animation) => animation.name).filter(Boolean));

  for (const clip of ["Idle", "WalkLoop", "RunLoop", "Jump", "Wave", "Flute", "Sit", "Cheer"]) {
    assert.ok(clipNames.has(clip), `missing xyshz animation clip ${clip}`);
  }
});

test("xyshz expressive clips have visible natural body motion", async () => {
  const { json: gltf, bin } = await readGlb(path.resolve("public/models/xyshz_rigged.glb"));

  const expectedMotion = {
    Jump: [
      ["Hips", 0.45],
      ["UpperLegL", 12],
      ["UpperLegR", 12],
      ["UpperArmL", 8],
      ["UpperArmR", 8],
    ],
    Wave: [
      ["UpperArmR", 30],
      ["ForeArmR", 35],
      ["HandR", 12],
      ["Chest", 3],
    ],
    Flute: [
      ["UpperArmL", 16],
      ["UpperArmR", 16],
      ["ForeArmL", 22],
      ["ForeArmR", 22],
      ["Head", 3],
    ],
    Sit: [
      ["Hips", 0.75],
      ["UpperLegL", 35],
      ["UpperLegR", 35],
      ["LowerLegL", 22],
      ["LowerLegR", 22],
    ],
    Cheer: [
      ["UpperArmL", 35],
      ["UpperArmR", 35],
      ["ForeArmL", 18],
      ["ForeArmR", 18],
      ["Chest", 4],
    ],
  };

  for (const [clipName, checks] of Object.entries(expectedMotion)) {
    const clip = findClip(gltf, clipName);
    for (const [nodeName, minimum] of checks) {
      const maxDelta = nodeName === "Hips"
        ? (() => {
            const nodeIndex = findNodeIndex(gltf, nodeName);
            const channel = clip.channels.find((candidate) => candidate.target.node === nodeIndex && candidate.target.path === "translation");
            assert.ok(channel, `missing ${nodeName} translation channel in ${clipName}`);
            return maxTranslationDelta(accessorRows(gltf, bin, clip.samplers[channel.sampler].output));
          })()
        : rotationDeltaForClip(gltf, bin, clip, nodeName);
      assert.ok(
        maxDelta >= minimum,
        `${clipName} ${nodeName} motion ${maxDelta.toFixed(2)} should be at least ${minimum}`,
      );
    }
  }
});

test("xyshz flute and sit clips place limbs like intentional actions", async () => {
  const { THREE, gltf } = await loadRiggedGltfScene();
  const flute = findClip(gltf, "Flute");
  const sit = findClip(gltf, "Sit");

  const fluteSamples = sampleWorldPositions(THREE, gltf, flute, ["HandL", "HandR", "Head"], 9);
  const lastFluteLeft = fluteSamples.HandL.at(-1);
  const lastFluteRight = fluteSamples.HandR.at(-1);
  const lastFluteHead = fluteSamples.Head.at(-1);
  const handHeightDiff = Math.abs(lastFluteLeft[1] - lastFluteRight[1]);
  const handSideDiff = Math.abs(lastFluteLeft[2] - lastFluteRight[2]);

  assert.ok(handHeightDiff < 9, `flute hands should meet near the mouth height, got diff=${handHeightDiff.toFixed(2)}`);
  assert.ok(handSideDiff < 15, `flute hands should stay close together, got side diff=${handSideDiff.toFixed(2)}`);
  assert.ok(
    Math.max(lastFluteLeft[1], lastFluteRight[1]) > lastFluteHead[1] - 18,
    "flute hands should lift toward the head rather than hang at the robe",
  );

  const sitSamples = sampleWorldPositions(THREE, gltf, sit, ["Hips", "FootL", "FootR"], 9);
  const startHips = sitSamples.Hips[0];
  const endHips = sitSamples.Hips.at(-1);
  const endFootL = sitSamples.FootL.at(-1);
  const endFootR = sitSamples.FootR.at(-1);
  assert.ok(startHips[1] - endHips[1] >= 10, `sit hips should lower visibly, got ${(startHips[1] - endHips[1]).toFixed(2)}`);
  assert.ok(endFootL[0] > endHips[0] + 4, "left foot should settle forward of the hips while sitting");
  assert.ok(endFootR[0] > endHips[0] + 4, "right foot should settle forward of the hips while sitting");
});

test("xyshz walk loop keeps deformation conservative enough for the robe mesh", async () => {
  const { json: gltf, bin } = await readGlb(path.resolve("public/models/xyshz_rigged.glb"));
  const walk = (gltf.animations ?? []).find((animation) => animation.name === "WalkLoop");
  assert.ok(walk, "missing WalkLoop animation");

  const rotationLimits = new Map([
    ["UpperLegL", 21],
    ["UpperLegR", 21],
    ["LowerLegL", 14],
    ["LowerLegR", 14],
    ["FootL", 10],
    ["FootR", 10],
    ["UpperArmL", 16],
    ["UpperArmR", 16],
    ["ForeArmL", 10],
    ["ForeArmR", 10],
    ["Chest", 3],
    ["Head", 2],
  ]);

  for (const channel of walk.channels) {
    const nodeName = gltf.nodes[channel.target.node]?.name;
    const sampler = walk.samplers[channel.sampler];
    const values = accessorRows(gltf, bin, sampler.output);
    if (channel.target.path === "rotation" && rotationLimits.has(nodeName)) {
      const maxDelta = maxRotationDeltaDegrees(values);
      assert.ok(
        maxDelta <= rotationLimits.get(nodeName),
        `${nodeName} rotates ${maxDelta.toFixed(2)}deg; expected <= ${rotationLimits.get(nodeName)}deg`,
      );
    }
    if (channel.target.path === "translation" && nodeName === "Hips") {
      const maxDelta = maxTranslationDelta(values);
      assert.ok(maxDelta <= 0.35, `Hips moves ${maxDelta.toFixed(3)}; expected <= 0.35`);
    }
  }
});

test("xyshz walk loop has visible stride motion after BVH retargeting", async () => {
  const { json: gltf, bin } = await readGlb(path.resolve("public/models/xyshz_rigged.glb"));
  const walk = (gltf.animations ?? []).find((animation) => animation.name === "WalkLoop");
  assert.ok(walk, "missing WalkLoop animation");

  const minimumVisibleRotation = new Map([
    ["UpperLegL", 12],
    ["UpperLegR", 12],
    ["LowerLegL", 9],
    ["LowerLegR", 9],
    ["UpperArmL", 10],
    ["UpperArmR", 10],
  ]);

  for (const [nodeName, minimumDegrees] of minimumVisibleRotation) {
    const nodeIndex = gltf.nodes.findIndex((node) => node.name === nodeName);
    assert.notEqual(nodeIndex, -1, `missing node ${nodeName}`);
    const channel = walk.channels.find((candidate) => candidate.target.node === nodeIndex && candidate.target.path === "rotation");
    assert.ok(channel, `missing ${nodeName} rotation channel`);
    const values = accessorRows(gltf, bin, walk.samplers[channel.sampler].output);
    const maxDelta = maxRotationDeltaDegrees(values);
    assert.ok(
      maxDelta >= minimumDegrees,
      `${nodeName} rotates ${maxDelta.toFixed(2)}deg; expected at least ${minimumDegrees}deg so walking is visible`,
    );
  }
});

test("xyshz walk loop moves feet forward and backward instead of sideways", async () => {
  const { THREE, gltf } = await loadRiggedGltfScene();
  const walk = (gltf.animations ?? []).find((animation) => animation.name === "WalkLoop");
  assert.ok(walk, "missing WalkLoop animation");

  const mixer = new THREE.AnimationMixer(gltf.scene);
  mixer.clipAction(walk).play();
  const samples = { FootL: [], FootR: [] };

  for (let i = 0; i < 17; i += 1) {
    mixer.setTime(walk.duration * (i / 16));
    gltf.scene.updateMatrixWorld(true);
    for (const footName of Object.keys(samples)) {
      const foot = gltf.scene.getObjectByName(footName);
      assert.ok(foot, `missing ${footName}`);
      const pos = new THREE.Vector3();
      foot.getWorldPosition(pos);
      samples[footName].push([pos.x, pos.y, pos.z]);
    }
  }

  for (const [footName, points] of Object.entries(samples)) {
    const forwardRange = axisRange(points, 0);
    const sidewaysRange = axisRange(points, 2);
    assert.ok(
      forwardRange > sidewaysRange * 1.8,
      `${footName} should stride along model front/back X, got forward=${forwardRange.toFixed(2)} sideways=${sidewaysRange.toFixed(2)}`,
    );
    assert.ok(
      sidewaysRange < 3.5,
      `${footName} swings sideways ${sidewaysRange.toFixed(2)} units; expected a human-like narrow step`,
    );
    assert.ok(
      forwardRange >= 14,
      `${footName} strides ${forwardRange.toFixed(2)} units forward/back; expected at least 14 so held walking remains visible`,
    );
  }
});

test("xyshz walk loop swings hands forward and backward instead of outward", async () => {
  const { THREE, gltf } = await loadRiggedGltfScene();
  const walk = (gltf.animations ?? []).find((animation) => animation.name === "WalkLoop");
  assert.ok(walk, "missing WalkLoop animation");

  const mixer = new THREE.AnimationMixer(gltf.scene);
  mixer.clipAction(walk).play();
  const samples = { HandL: [], HandR: [] };

  for (let i = 0; i < 17; i += 1) {
    mixer.setTime(walk.duration * (i / 16));
    gltf.scene.updateMatrixWorld(true);
    for (const handName of Object.keys(samples)) {
      const hand = gltf.scene.getObjectByName(handName);
      assert.ok(hand, `missing ${handName}`);
      const pos = new THREE.Vector3();
      hand.getWorldPosition(pos);
      samples[handName].push([pos.x, pos.y, pos.z]);
    }
  }

  for (const [handName, points] of Object.entries(samples)) {
    const forwardRange = axisRange(points, 0);
    const sidewaysRange = axisRange(points, 2);
    assert.ok(
      forwardRange > sidewaysRange * 1.2,
      `${handName} should swing along model front/back X, got forward=${forwardRange.toFixed(2)} sideways=${sidewaysRange.toFixed(2)}`,
    );
    assert.ok(
      sidewaysRange < 4.5,
      `${handName} swings outward ${sidewaysRange.toFixed(2)} units; expected arms to stay beside the robe`,
    );
  }
});

test("xyshz run loop has a stronger forward stride than walking", async () => {
  const { THREE, gltf } = await loadRiggedGltfScene();
  const walk = (gltf.animations ?? []).find((animation) => animation.name === "WalkLoop");
  const run = (gltf.animations ?? []).find((animation) => animation.name === "RunLoop");
  assert.ok(walk, "missing WalkLoop animation");
  assert.ok(run, "missing RunLoop animation");

  function footForwardRange(clip) {
    const mixer = new THREE.AnimationMixer(gltf.scene);
    mixer.clipAction(clip).play();
    const samples = { FootL: [], FootR: [] };
    for (let i = 0; i < 17; i += 1) {
      mixer.setTime(clip.duration * (i / 16));
      gltf.scene.updateMatrixWorld(true);
      for (const footName of Object.keys(samples)) {
        const foot = gltf.scene.getObjectByName(footName);
        assert.ok(foot, `missing ${footName}`);
        const pos = new THREE.Vector3();
        foot.getWorldPosition(pos);
        samples[footName].push([pos.x, pos.y, pos.z]);
      }
    }
    return Object.fromEntries(
      Object.entries(samples).map(([footName, points]) => [
        footName,
        { forward: axisRange(points, 0), sideways: axisRange(points, 2) },
      ]),
    );
  }

  const walkRange = footForwardRange(walk);
  const runRange = footForwardRange(run);
  assert.ok(run.duration < walk.duration, `RunLoop should cycle faster than WalkLoop; got run=${run.duration.toFixed(3)} walk=${walk.duration.toFixed(3)}`);

  for (const footName of ["FootL", "FootR"]) {
    assert.ok(
      runRange[footName].forward >= walkRange[footName].forward * 1.15,
      `${footName} run stride ${runRange[footName].forward.toFixed(2)} should be at least 15% stronger than walk ${walkRange[footName].forward.toFixed(2)}`,
    );
    assert.ok(
      runRange[footName].sideways < 3.5,
      `${footName} run sideways swing ${runRange[footName].sideways.toFixed(2)} should stay narrow`,
    );
  }
});

test("xyshz run loop swings hands forward and backward", async () => {
  const { THREE, gltf } = await loadRiggedGltfScene();
  const run = (gltf.animations ?? []).find((animation) => animation.name === "RunLoop");
  assert.ok(run, "missing RunLoop animation");

  const mixer = new THREE.AnimationMixer(gltf.scene);
  mixer.clipAction(run).play();
  const samples = { HandL: [], HandR: [] };

  for (let i = 0; i < 17; i += 1) {
    mixer.setTime(run.duration * (i / 16));
    gltf.scene.updateMatrixWorld(true);
    for (const handName of Object.keys(samples)) {
      const hand = gltf.scene.getObjectByName(handName);
      assert.ok(hand, `missing ${handName}`);
      const pos = new THREE.Vector3();
      hand.getWorldPosition(pos);
      samples[handName].push([pos.x, pos.y, pos.z]);
    }
  }

  for (const [handName, points] of Object.entries(samples)) {
    const forwardRange = axisRange(points, 0);
    const sidewaysRange = axisRange(points, 2);
    assert.ok(
      forwardRange >= 1.4,
      `${handName} run swing ${forwardRange.toFixed(2)} should be visibly animated`,
    );
    assert.ok(
      forwardRange > sidewaysRange * 1.2,
      `${handName} should swing along model front/back X, got forward=${forwardRange.toFixed(2)} sideways=${sidewaysRange.toFixed(2)}`,
    );
    assert.ok(
      sidewaysRange < 5.0,
      `${handName} run sideways swing ${sidewaysRange.toFixed(2)} should stay close to the robe`,
    );
  }
});

test("xyshz rig follows the source model axis instead of treating front-back as left-right", async () => {
  const gltf = await readGlbJson(path.resolve("public/models/xyshz_rigged.glb"));
  const nodesByName = new Map((gltf.nodes ?? []).map((node) => [node.name, node]));

  for (const [left, right] of [
    ["UpperLegL", "UpperLegR"],
    ["UpperArmL", "UpperArmR"],
  ]) {
    const leftPosition = nodesByName.get(left)?.translation;
    const rightPosition = nodesByName.get(right)?.translation;
    assert.ok(leftPosition, `missing translation for ${left}`);
    assert.ok(rightPosition, `missing translation for ${right}`);

    const xSeparation = Math.abs(leftPosition[0] - rightPosition[0]);
    const zSeparation = Math.abs((leftPosition[2] ?? 0) - (rightPosition[2] ?? 0));
    assert.ok(
      zSeparation > xSeparation * 1.5,
      `${left}/${right} should separate across the model's visual left-right axis; got x=${xSeparation.toFixed(3)}, z=${zSeparation.toFixed(3)}`,
    );
  }
});

test("xyshz walk loop is sampled from the CMU walk BVH instead of five guessed poses", async () => {
  const script = await readRigScript();
  assert.match(script, /external.*mocap.*02_01\.bvh/s);
  assert.match(script, /parse_bvh_motion/);

  const { json: gltf, bin } = await readGlb(path.resolve("public/models/xyshz_rigged.glb"));
  const walk = (gltf.animations ?? []).find((animation) => animation.name === "WalkLoop");
  assert.ok(walk, "missing WalkLoop animation");

  const upperLegL = gltf.nodes.findIndex((node) => node.name === "UpperLegL");
  const channel = walk.channels.find((candidate) => candidate.target.node === upperLegL && candidate.target.path === "rotation");
  assert.ok(channel, "missing UpperLegL rotation channel");
  const times = accessorRows(gltf, bin, walk.samplers[channel.sampler].input);
  assert.ok(times.length >= 24, `expected BVH-sampled WalkLoop keyframes, got ${times.length}`);
});
