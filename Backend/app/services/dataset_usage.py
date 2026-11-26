"""Protege bases em uso dentro da instância única de backend suportada pelo projeto."""
from collections import defaultdict
from contextlib import contextmanager
from threading import RLock
from uuid import uuid4

dataset_lock = RLock()
_users: dict[tuple, set[str]] = defaultdict(set)


def key(repository, identifier):
    return str(repository.root), repository.institution_id, identifier


def active_users(repository, identifier) -> set[str]:
    with dataset_lock:
        return set(_users.get(key(repository, identifier), set()))


@contextmanager
def using_dataset(repository, identifier, run_id=None):
    token = run_id or uuid4().hex
    with dataset_lock:
        record = repository.get("datasets", identifier)
        identity = key(repository, record["id"])
        _users[identity].add(token)
    try:
        yield
    finally:
        with dataset_lock:
            _users[identity].discard(token)
            if not _users[identity]:
                del _users[identity]
