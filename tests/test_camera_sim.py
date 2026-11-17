"""The camera simulator (`cameras.sim`): frames that look like a laser beam on a
camera, not random static.

"Smart" is the point. A simulator that fills frames with noise ("šum") teaches
nothing about how the screen behaves with a real beam, and it lies about load:
noise is the worst case for compression, while a real beam frame is mostly a
dark, quiet background with one bright spot.
"""

from __future__ import annotations

import numpy as np

from cameras.encode import encode_tile
from cameras.sim import BeamSimulator
from cameras.spec import CameraSpec, SimBeam


def camera(**overrides) -> CameraSpec:
    fields = dict(pv="SIM:CAM1:Image", width=1024, height=1024, bits=12, rate=10.0)
    fields.update(overrides)
    return CameraSpec(**fields)


class TestFrame:
    def test_has_the_declared_geometry_and_a_beam_well_above_the_background(self):
        spec = camera(width=640, height=480)
        frame = BeamSimulator(spec, seed=1).next()

        assert frame.shape == (480, 640)
        assert frame.dtype == np.uint16
        background = np.median(frame)
        assert frame.max() > background + 0.3 * spec.max_value
        assert frame.max() <= spec.max_value


def beam(frame: np.ndarray) -> np.ndarray:
    """The frame with its background taken off, as floats."""
    return frame.astype(np.float64) - np.median(frame)


class TestCharacter:
    def test_the_same_camera_and_seed_give_the_same_frames(self):
        spec = camera(width=128, height=128)
        a, b = BeamSimulator(spec, seed=7), BeamSimulator(spec, seed=7)
        for _ in range(5):
            assert np.array_equal(a.next(), b.next())

    def test_no_two_cameras_look_alike(self):
        """A wall of identical spots would hide a mix-up of camera and tile."""
        frames = [
            BeamSimulator(camera(pv=f"SIM:CAM{n}:Image", width=128, height=128), seed=1).next()
            for n in range(4)
        ]
        centroids = {centroid(frame) for frame in frames}
        assert len(centroids) == 4

    def test_a_flattop_beam_has_a_plateau_and_a_gaussian_does_not(self):
        def plateau(profile: str) -> float:
            spec = camera(width=256, height=256, sim=SimBeam(profile=profile, waist=60, jitter=0))
            signal = beam(BeamSimulator(spec, seed=1).next())
            peak = signal.max()
            return (signal > 0.9 * peak).sum() / (signal > 0.5 * peak).sum()

        assert plateau("flattop") > 0.5
        assert plateau("gaussian") < 0.3


def centroid(frame: np.ndarray) -> tuple[int, int]:
    signal = np.clip(beam(frame), 0, None)
    ys, xs = np.indices(signal.shape)
    total = signal.sum()
    return round((ys * signal).sum() / total), round((xs * signal).sum() / total)


class TestBehaviour:
    def test_the_beam_moves_from_frame_to_frame_but_stays_near_home(self):
        """Pointing jitter: a frozen spot reads as a frozen screen, and one
        that random-walks away reads as a fault. Mean-reverting jitter around
        home, plus a slow drift, is what a real beam does."""
        spec = camera(width=256, height=256, sim=SimBeam(waist=12, pointing=2.0))
        simulator = BeamSimulator(spec, seed=3)
        home = simulator.home

        centroids = [centroid(simulator.next()) for _ in range(1000)]

        moves = sum(1 for a, b in zip(centroids, centroids[1:]) if a != b)
        assert moves > 500
        furthest = max(np.hypot(y - home[0], x - home[1]) for y, x in centroids)
        assert furthest < 0.15 * 256

    def test_the_energy_fluctuates_shot_to_shot_by_the_configured_jitter(self):
        def spread(jitter: float) -> float:
            spec = camera(width=128, height=128, sim=SimBeam(waist=15, jitter=jitter, pointing=0))
            simulator = BeamSimulator(spec, seed=5)
            energies = [beam(simulator.next()).sum() for _ in range(300)]
            return float(np.std(energies) / np.mean(energies))

        assert 0.02 < spread(0.03) < 0.045
        assert spread(0.0) < 0.01

    def test_a_spike_saturates_the_sensor(self):
        spec = camera(width=128, height=128, sim=SimBeam(waist=15, spikes=1.0))
        frame = BeamSimulator(spec, seed=1).next()
        assert frame.max() == spec.max_value
        assert (frame == spec.max_value).sum() > 10

    def test_without_spikes_a_nominal_beam_does_not_saturate(self):
        spec = camera(width=128, height=128, sim=SimBeam(waist=15, spikes=0.0))
        simulator = BeamSimulator(spec, seed=1)
        assert all(simulator.next().max() < spec.max_value for _ in range(50))


class TestSensor:
    def test_the_background_has_a_real_sensors_noise_floor(self):
        """Not perfectly flat — a flat black frame looks like a dead camera —
        but quiet: read noise of a few counts on a small dark offset."""
        spec = camera(width=256, height=256, sim=SimBeam(waist=10))
        frame = BeamSimulator(spec, seed=1).next().astype(np.float64)
        corner = frame[:40, :40]
        assert 50 < corner.mean() < 200
        assert 1.0 < corner.std() < 10.0

    def test_a_frame_is_not_noise(self):
        """The anti-šum test. Noise is the worst case for compression; a beam
        frame — a quiet background and one bright spot — is not, and the
        bytes a browser receives depend on exactly that. A simulator that
        failed this would make every load measurement taken with it
        pessimistic and misleading.

        Measured on what is actually sent (the JPEG tile), not on the raw
        16-bit frame: CA carries frames uncompressed whatever they show, and
        a real sensor's read noise keeps raw frames from compressing much.
        """
        spec = camera(width=512, height=512, sim=SimBeam(waist=40))
        frame = BeamSimulator(spec, seed=1).next()
        noise = np.random.default_rng(0).integers(0, spec.max_value + 1, frame.shape, dtype=np.uint16)

        def sent(image: np.ndarray) -> int:
            return len(encode_tile(image, spec, factor=1).data)

        assert sent(noise) > 10 * sent(frame)

    def test_hot_pixels_stay_where_they_are(self):
        spec = camera(width=256, height=256, sim=SimBeam(waist=10))
        simulator = BeamSimulator(spec, seed=1)
        frames = [simulator.next() for _ in range(3)]
        background = np.median(frames[0])

        hot = [set(zip(*np.nonzero(frame > background + 0.15 * spec.max_value))) for frame in frames]
        stuck = hot[0] & hot[1] & hot[2]
        # The beam is bright too, but it moves; hot pixels far from it do not.
        far = {(y, x) for y, x in stuck if np.hypot(y - simulator.home[0], x - simulator.home[1]) > 60}
        assert len(far) >= 2
