// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

import "suave-std/Suapp.sol";
import "suave-std/Context.sol";
import "suave-std/Transactions.sol";
import "suave-std/suavelib/Suave.sol";
import "suave-std/crypto/Secp256k1.sol";
import "forge-std/console.sol";

contract BlindlyCash is Suapp {
    uint256 public constant NoteValue = 0.1 ether;

    string public constant RSA_D_KEY = "RSA_D_KEY";
    string public constant PRV_KEY_FOR_CHEAP_VERIFY =
        "PRV_KEY_FOR_CHEAP_VERIFY";

    address public addressForCheapVerify;

    Suave.DataId public recordDataId;
    RSAPubKey public pubKey;

    mapping(bytes32 => bool) public depositMsgHashMap;
    mapping(bytes32 => bool) public redeemedMsgHashMap;

    struct RSAPubKey {
        uint256 e;
        bytes N;
    }

    event Deposit(address adx, uint256 amount, bytes32 msgHash);

    address public owner;
    constructor() public {
        owner = msg.sender;
    }

    function offchainInit() public returns (bytes memory) {
        require(msg.sender == owner, "only owner can init");

        address[] memory peekers = new address[](1);
        peekers[0] = address(this);
        Suave.DataRecord memory record = Suave.newDataRecord(
            0,
            peekers,
            peekers,
            "key"
        );

        // get RSA keypair from CCR: (e, d, N)
        bytes memory keypairData = Context.confidentialInputs();
        (uint256 e, bytes memory d, bytes memory N) = abi.decode(
            keypairData,
            (uint256, bytes, bytes)
        );
        Suave.confidentialStore(record.id, RSA_D_KEY, d);
        // todo validate RSA keypair

        // gen private key
        string memory prvKey = Suave.privateKeyGen(
            Suave.CryptoSignature.SECP256
        );
        Suave.confidentialStore(
            record.id,
            PRV_KEY_FOR_CHEAP_VERIFY,
            bytes(prvKey)
        );

        address addressForCheapVerify = Secp256k1.deriveAddress(prvKey);

        return
            abi.encodeWithSelector(
                this.onchainInit.selector,
                record.id,
                e,
                N,
                addressForCheapVerify
            );
    }

    function onchainInit(
        Suave.DataId _recordDataId,
        uint256 e,
        bytes calldata N,
        address _addressForCheapVerify
    ) public {
        require(msg.sender == owner, "only owner can init");

        recordDataId = _recordDataId;

        pubKey = RSAPubKey({e: e, N: N});
        addressForCheapVerify = _addressForCheapVerify;
    }

    function deposit(bytes32 msgHash) public payable {
        require(msg.value == NoteValue, "not supported note value");
        require(
            depositMsgHashMap[msgHash] == false,
            "deposit message hash used"
        );

        depositMsgHashMap[msgHash] = true;

        emit Deposit(msg.sender, msg.value, msgHash);
    }

    function offchainRedeem(
        bytes calldata encryptedTriplet,
        uint256 minTipBP
    ) public returns (bytes memory) {
        bytes memory d = Suave.confidentialRetrieve(recordDataId, RSA_D_KEY);
        bytes memory decryptedTriplet = modexp(encryptedTriplet, d, pubKey.N);

        // (bytes32 originMsg, address redeemTo, uint256 tipBP) = abi.decode(decryptedTriplet, (bytes32, address, uint256));
        bytes32 originMsg = takeBytes32FromBytes(
            decryptedTriplet,
            decryptedTriplet.length - 32 * 3
        );
        address redeemTo = address(
            uint160(
                uint256(
                    takeBytes32FromBytes(
                        decryptedTriplet,
                        decryptedTriplet.length - 32 * 2
                    )
                )
            )
        );
        uint256 tipBP = uint256(
            takeBytes32FromBytes(
                decryptedTriplet,
                decryptedTriplet.length - 32 * 1
            )
        );

        require(tipBP >= minTipBP, "tip too low");
        require(tipBP <= 1000, "tip too high");

        bytes32 originMsgHash = keccak256(bytes.concat(originMsg));

        require(
            depositMsgHashMap[originMsgHash],
            "deposit message hash not found"
        );
        require(!redeemedMsgHashMap[originMsgHash], "origin msg used");

        // sign the payload for onchainRedeem
        bytes memory onchainPayload = abi.encode(
            originMsgHash,
            redeemTo,
            msg.sender,
            tipBP
        );

        bytes memory prvKey = Suave.confidentialRetrieve(
            recordDataId,
            PRV_KEY_FOR_CHEAP_VERIFY
        );
        bytes memory payloadSig = Suave.signMessage(
            bytes.concat(keccak256(onchainPayload)),
            Suave.CryptoSignature.SECP256,
            string(prvKey)
        );

        address tipTo = msg.sender;
        return
            abi.encodeWithSelector(
                this.onchainRedeem.selector,
                originMsgHash,
                redeemTo,
                tipTo,
                tipBP,
                payloadSig
            );
    }

    function onchainRedeem(
        bytes32 originMsgHash,
        address redeemTo,
        address tipTo,
        uint256 tipBP,
        bytes memory sig
    ) public {
        require(
            depositMsgHashMap[originMsgHash],
            "deposit message hash not found"
        );

        require(!redeemedMsgHashMap[originMsgHash], "redeemed message hash");
        redeemedMsgHashMap[originMsgHash] = true;

        require(tipBP <= 1000, "middleManTip too high");
        uint256 toMiddleManVal = (NoteValue * tipBP) / 10000;

        // check if sig is signed by us by using ecrecover
        // take r, s, v from byte32 sig
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(sig, 0x20))
            s := mload(add(sig, 0x40))
            v := add(byte(0, mload(add(sig, 0x60))), 27)
        }

        bytes memory payload = abi.encode(
            originMsgHash,
            redeemTo,
            tipTo,
            tipBP
        );

        // recover pubkey from r, s, v
        address recoveredAddress = ecrecover(keccak256(payload), v, r, s);
        require(recoveredAddress == addressForCheapVerify, "invalid signature");

        uint256 tipVal = (NoteValue * tipBP) / 10000;
        if (tipBP > 0) {
            (bool sent, bytes memory data) = payable(tipTo).call{value: tipVal}(
                ""
            );
            require(sent, "fail send tip");
        }

        (bool sent, bytes memory data) = payable(redeemTo).call{
            value: NoteValue - tipVal
        }("");
        require(sent, "fail redeem ether");
    }

    // modexp precompile in geth: https://github.com/ethereum/go-ethereum/blob/master/core/vm/contracts.go#L409-L442
    function modexp(
        bytes memory _b,
        bytes memory _e,
        bytes memory _m
    ) public returns (bytes memory) {
        uint256 _bSize = _b.length;
        uint256 _eSize = _e.length;
        uint256 _mSize = _m.length;

        bytes memory data = bytes.concat(
            abi.encodePacked(_bSize),
            abi.encodePacked(_eSize),
            abi.encodePacked(_mSize),
            _b,
            _e,
            _m
        );
        (bool success, bytes memory returnData) = address(0x05).call(data);

        require(success, "modexp must succeed");
        return returnData;
    }

    function takeBytes32FromBytes(
        bytes memory payload,
        uint256 fromIdx
    ) public pure returns (bytes32 result) {
        require(payload.length >= fromIdx + 32, "payload too short");
        assembly {
            result := mload(add(payload, add(fromIdx, 32)))
        }
        return result;
    }
}
