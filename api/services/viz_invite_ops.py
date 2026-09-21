"""Local binary-serializable operation classes for VIZ invite operations.

viz-python-lib 1.1.0 registers the invite operation *ids* in
``vizbase.operationids`` (``create_invite``, ``invite_registration``) but ships
no matching ``GrapheneObject`` subclasses in ``vizbase.operations``, so the
standard signing/broadcast path can't build them. These classes fill that gap
without upgrading or forking the library.

The broadcast path (``graphenebase.objects.Operation._loadGrapheneObject``)
resolves an op to its chain id via ``op.__class__.__name__.lower()`` looked up
in the ``operations`` id map. The class names below therefore MUST be exactly
``Create_invite`` and ``Invite_registration`` so they lower-case to the
registered ids ``create_invite`` / ``invite_registration``.

Field order and types mirror the canonical serializers in viz-js-lib
(``lib/auth/serializer/src/operations.js``):

    create_invite        { creator: string, balance: asset, invite_key: public_key }
    invite_registration  { initiator: string, new_account_name: string,
                           invite_secret: string, new_account_key: public_key }
"""

from collections import OrderedDict

from graphenebase.types import String
from vizbase.account import PublicKey
from vizbase.chains import DEFAULT_PREFIX
from vizbase.objects import Amount, GrapheneObject, isArgsThisClass


class Create_invite(GrapheneObject):
    def __init__(self, *args, **kwargs):
        if isArgsThisClass(self, args):
            self.data = args[0].data
        else:
            if len(args) == 1 and len(kwargs) == 0:
                kwargs = args[0]
            prefix = kwargs.pop("prefix", DEFAULT_PREFIX)
            super().__init__(
                OrderedDict(
                    [
                        ("creator", String(kwargs["creator"])),
                        ("balance", Amount(kwargs["balance"])),
                        ("invite_key", PublicKey(kwargs["invite_key"], prefix=prefix)),
                    ]
                )
            )


class Invite_registration(GrapheneObject):
    def __init__(self, *args, **kwargs):
        if isArgsThisClass(self, args):
            self.data = args[0].data
        else:
            if len(args) == 1 and len(kwargs) == 0:
                kwargs = args[0]
            prefix = kwargs.pop("prefix", DEFAULT_PREFIX)
            super().__init__(
                OrderedDict(
                    [
                        ("initiator", String(kwargs["initiator"])),
                        ("new_account_name", String(kwargs["new_account_name"])),
                        ("invite_secret", String(kwargs["invite_secret"])),
                        ("new_account_key", PublicKey(kwargs["new_account_key"], prefix=prefix)),
                    ]
                )
            )
