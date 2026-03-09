from pathlib import Path

from nanobot.session.manager import Session, SessionManager


def test_session_manager_get_and_delete(tmp_path: Path) -> None:
    manager = SessionManager(tmp_path)
    session = Session(key="web:default")
    session.add_message("user", "hello")
    manager.save(session)

    loaded = manager.get("web:default")
    assert loaded is not None
    assert loaded.messages[0]["content"] == "hello"

    assert manager.delete("web:default") is True
    assert manager.get("web:default") is None
