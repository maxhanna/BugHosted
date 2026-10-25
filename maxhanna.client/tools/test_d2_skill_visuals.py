import unittest

from PIL import Image

from import_d2_skill_visuals import remove_black_background


class MissileTransparencyTests(unittest.TestCase):
    def test_removes_opaque_black_matte(self):
        image = Image.new("RGBA", (3, 1))
        image.putdata([
            (0, 0, 0, 255),
            (180, 180, 180, 255),
            (0, 0, 0, 0),
        ])

        result = remove_black_background(image)

        self.assertEqual(result.getpixel((0, 0))[3], 0)
        self.assertEqual(result.getpixel((1, 0)), (180, 180, 180, 255))
        self.assertEqual(result.getpixel((2, 0))[3], 0)

    def test_removes_dark_matte_from_partially_transparent_edges(self):
        image = Image.new("RGBA", (4, 1))
        image.putdata([
            (0, 0, 0, 128),
            (20, 20, 20, 200),
            (25, 25, 25, 255),
            (80, 80, 80, 128),
        ])

        result = remove_black_background(image)

        self.assertEqual(result.getpixel((0, 0))[3], 0)
        self.assertLess(result.getpixel((1, 0))[3], 200)
        self.assertLess(result.getpixel((2, 0))[3], 255)
        self.assertEqual(result.getpixel((3, 0))[3], 128)

    def test_preserves_color_and_is_idempotent(self):
        image = Image.new("RGBA", (2, 1))
        image.putdata([(10, 20, 80, 255), (20, 20, 20, 100)])

        result = remove_black_background(image)
        repeated = remove_black_background(result)

        self.assertEqual(result.getpixel((0, 0)), (10, 20, 80, 255))
        self.assertEqual(result.getpixel((0, 0)), repeated.getpixel((0, 0)))


if __name__ == "__main__":
    unittest.main()
