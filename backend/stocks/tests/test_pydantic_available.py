def test_pydantic_v2_is_importable():
    import pydantic

    major = int(pydantic.VERSION.split(".")[0])
    assert major >= 2, f"need pydantic v2, got {pydantic.VERSION}"
