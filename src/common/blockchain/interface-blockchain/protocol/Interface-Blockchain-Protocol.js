import NodesList from 'node/lists/nodes-list'
import InterfaceBlockchainProtocolForkSolver from './Interface-Blockchain-Protocol-Fork-Solver'
import InterfaceBlockchainProtocolForksManager from "./Interface-Blockchain-Protocol-Forks-Manager"

import Serialization from 'common/utils/Serialization';
import NodeProtocol from 'common/sockets/protocol/node-protocol'
import BufferExtended from "common/utils/BufferExtended"

/**
 * Blockchain Protocol
 */
class InterfaceBlockchainProtocol {

    constructor(blockchain) {

        this.blockchain = blockchain;

        this.acceptBlockHeaders = true;
        this.acceptBlocks = true;

        this.forkSolver = undefined;
        this.tipsManager = undefined;


    }

    setBlockchain(blockchain){
        this.blockchain = blockchain;

        if (this.forkSolver !== undefined)
            this.forkSolver.blockchain = blockchain;

        if (this.tipsManager !== undefined)
            this.tipsManager.blockchain = blockchain;
    }

    initialize(params){

        this.acceptBlockHeaders = params.indexOf("acceptBlockHeaders") >= 0;
        this.acceptBlocks = params.indexOf("acceptBlocks") >= 0;

        NodesList.emitter.on("nodes-list/connected", (result) => {
            this._initializeNewSocket(result)
        });
        NodesList.emitter.on("nodes-list/disconnected", (result) => {
            this._uninitializeSocket(result)
        });

        //already connected sockets
        for (let i=0; i<NodesList.nodes.length; i++)
            this._initializeNewSocket(NodesList.nodes[i]);

        this.createForkSolver();
        this.createForksManager();
    }

    createForkSolver(){
        this.forkSolver = new InterfaceBlockchainProtocolForkSolver(this.blockchain, this);
    }

    createForksManager(){
        this.forksManager = new InterfaceBlockchainProtocolForksManager(this.blockchain, this);
    }

    propagateHeader(block,  socketsAvoidBroadcast){

        // broadcasting the new block, to everybody else
        NodeProtocol.broadcastRequest( "g/new-block", {
            l: this.blockchain.blocks.length,
            h: this.blockchain.blocks.last.hash,
            s: this.blockchain.blocks.blocksStartingPoint,
        }, "all", socketsAvoidBroadcast);

    }

    _validateBlockchainHeader(data){

        if ( data=== undefined || data === null) throw {message: "data is not defined"};

        // validating data
        if (typeof data.chainLength !== 'number') throw {message: 'chainLength is not specified'};
        if (typeof data.chainStartingPoint !== 'number') throw {message: 'chainStartingPoint is not specified'};

        if (typeof data.height !== 'number') throw {message: 'height is not specified'};
        if (typeof data.header !== 'object') throw {message: 'header is not specified'};
        if (data.header === undefined ) throw {message:'header.header is not specified'};
        if (data.header.hashPrev === undefined ) throw {message:'header.hashPrev is not specified'};
        if (data.header.hash === undefined) throw {message: 'header.hash is not specified'};

        if (typeof data.header.hashPrev === 'string')
            data.header.hashPrev = Serialization.fromBase(data.header.hashPrev);

        if (typeof data.header.hash === 'string')
            data.header.hash = Serialization.fromBase(data.header.hash);

        if ((typeof data.header.nonce === 'number' || Buffer.isBuffer(data.header.nonce)) === false)
            throw {message: 'nonce is not specified'};

        if (typeof data.header.data.hashData === 'string')
            data.header.data.hashData = Serialization.fromBase(data.header.data.hashData);

        if (data.header.chainLength < data.header.height)
            throw {message: 'chainLength is smaller than block height ?? ', dataChainLength: data.header.chainLength, dataHeaderHeight: data.header.height};

        if (data.header.chainStartingPoint > data.header.height )
            throw {message: 'chainLength is smaller than block height ?? ', dataChainStartingPoint: data.header.chainStartingPoint, dataHeaderHeight: data.header.height};

    }

    _initializeNewSocket(nodesListObject) {

        let socket = nodesListObject.socket;

        // sending the last block using the protocol
        if (this.acceptBlockHeaders)
            socket.node.on("g/last-block", async (data)=>{

                if (this.blockchain.blocks.length > 0) {
                    socket.node.sendRequest("g/last-block/a", {
                        l: this.blockchain.blocks.length,
                        h: this.blockchain.blocks.last.hash,
                        s: this.blockchain.blocks.blocksStartingPoint,
                    } );
                }

            });

        if (this.acceptBlockHeaders)
            socket.node.on("head/new-block", async (data) => {

                /*
                    h hash
                    l chainLength
                    s chainStartingPoint
                 */

                if (data === null || (data.l < 0) || ( data.s >= data.l ) ) return;

                //in case the hashes are the same, and I have already the block
                if (( data.l > 0 && this.blockchain.blocks.length === data.l )) {

                    //in case the hashes are exactly the same, there is no reason why we should download it
                    if ( Buffer.compare(this.blockchain.blocks[this.blockchain.blocks.length-1].hash, data.h) <= 0 )
                        return;

                }

                console.log("newForkTip");

                await this.forksManager.newForkTip( socket, data.l, data.s, data.h );

            });

        if (this.acceptBlockHeaders)
            socket.node.on("g/hash", (h) => {

                // height

                if (typeof h !== 'number') return;

                if (this.blockchain.blocks.length <= h) return;

                let block = this.blockchain.blocks[h];
                if (block === undefined) socket.node.sendRequest("head/hash", null);

                socket.node.sendRequest("head/hash/" + h , block.hash );

            });


        if (this.acceptBlocks)

            socket.node.on("blockchain/blocks/request-block-by-height", (data) => {

                // data.height
                // data.onlyHeader

                try {

                    if (typeof data.height !== 'number')
                        throw {message: "data.height is not defined"};

                    if (this.blockchain.blocks.length <= data.height)
                        throw {message: "data.height is higher than I have ", blockchainLength:this.blockchain.blocks.length, clientHeight:data.height};

                    let block = this.blockchain.blocks[data.height];

                    if (block === undefined)
                        throw {message: "block is empty", height: data.height};

                    socket.node.sendRequest("blockchain/blocks/request-block-by-height/" + (data.height || 0), {
                        result: true,
                        block: block.serializeBlock(data.onlyHeader || false)
                    });

                } catch (exception) {

                    console.error("Socket Error - blockchain/blocks/request-block-by-height ", exception);
                    socket.node.sendRequest("blockchain/blocks/request-block-by-height/" + data.height || 0, {
                        result: false,
                        message: exception,
                    });

                }


            });

        this.askBlockchain(socket);

    }

    _uninitializeSocket(nodesListObject) {

        let socket = nodesListObject.socket;

    }

    async askBlockchain(socket){

        let data = await socket.node.sendRequestWaitOnce("g/last-block", undefined, "a");

        //in case the hashes are the same, and I have already the block
        if (( data.l > 0 && this.blockchain.blocks.length === data.l )) {

            //in case the hashes are exactly the same, there is no reason why we should download it
            if ( Buffer.compare( this.blockchain.getHashPrev( data.l ), data.h ) <= 0 )
                return;

        }

        this.forksManager.newForkTip(socket, data.l, data.s, data.h );

    }

}


export default InterfaceBlockchainProtocol;