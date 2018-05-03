import NodesList from 'node/lists/nodes-list'
import NodeSignalingServerProtocol from "./../Node-Signaling-Server-Protocol"
import SignalingServerRoomListConnections from '../signaling-server-room/Signaling-Server-Room-List-Connections'
import NodeSignalingServerWaitlistObjectType from "./Node-Signaling-Server-Waitlist-Object-Type"
import SignalingServerRoomConnectionObject from './../signaling-server-room/Signaling-Server-Room-Connection-Object';

class NodeSignalingServerService{

    constructor(){

        this.waitlistSlaves = []; //slaves
        this.waitlistMasters = [];

        this.started = false;

        NodesList.emitter.on("nodes-list/disconnected", (nodesListObject) => {
            this._deleteNode(nodesListObject.socket, this.waitlistMasters);
            this._deleteNode(nodesListObject.socket, this.waitlistSlaves);
        });

        setInterval(()=>{

            console.log("slaves", this.waitlistSlaves.length);
            let string = "";
            for (let i=0; i<this.waitlistSlaves.length; i++)
                string += this.waitlistSlaves[i].node.sckAddress.getAddress(false)+" ";
            console.log(string);

            console.log("master", this.waitlistMasters.length);
            string = "";
            for (let i=0; i<this.waitlistMasters.length; i++)
                string += this.waitlistMasters[i].node.sckAddress.getAddress(false)+" ";
            console.log(string);

            console.log("");console.log("");console.log("");
        }, 3000)

    }

    _deleteNode(socket, list){

        if (socket === undefined) return;

        let uuid = socket.node.sckAddress.uuid;

        for (let i=list.length-1; i>=0; i--)
            if ( list[i].node.sckAddress.uuid === uuid) {
                list.splice(i, 1);
                return;
            }

    }

    async registerSocketForSignaling(socket, acceptWebPeers = true){

        let waitlistObject = this.searchNodeSignalingServerWaitlist(socket);

        if (waitlistObject === null) {

            socket.node.signaling = {};
            socket.node.signaling.type = NodeSignalingServerWaitlistObjectType.NODE_SIGNALING_SERVER_WAITLIST_SLAVE;
            socket.node.signaling.acceptWebPeers = acceptWebPeers;

            this.waitlistSlaves.push( socket );
        }

        return waitlistObject;
    }

    startConnectingWebPeers(){

        if ( this.started === true )
            return;

        this.started = true;

        this._connectWebPeers();
    }

    _findNodeSignalingServerWaitlist(socket, list){

        for (let i=0; i<list.length; i++)
            if (list[i].node.sckAddress.uuid === socket.node.sckAddress.uuid)
                return i;

        return -1;
    }

    searchNodeSignalingServerWaitlist( socket ){

        let pos = this._findNodeSignalingServerWaitlist(socket, this.waitlistMasters);
        if (pos !== -1) return this.waitlistMasters[pos];

        pos = this._findNodeSignalingServerWaitlist(socket, this.waitlistSlaves );
        if (pos !== -1) return this.waitlistSlaves[pos];

        return null;
    }

    _connectWebPeers(){

        //TODO instead of using Interval, to use an event based Protocol

        //mixing users
        for (let i = 0; i < this.waitlistSlaves.length; i++)

            if (this.waitlistSlaves[i].node.signaling.acceptWebPeers) {

                let master = false;

                // Step 0 , finding two different clients
                for (let j = 0; j < this.waitlistMasters.length; j++)
                    if (this.waitlistMasters[j].node.signaling.acceptWebPeers) {

                        let previousEstablishedConnection = SignalingServerRoomListConnections.searchSignalingServerRoomConnection(this.waitlistSlaves[i], this.waitlistMasters[j]);

                        if (previousEstablishedConnection === null || (previousEstablishedConnection.status !== SignalingServerRoomConnectionObject.ConnectionStatus.peerConnectionError && previousEstablishedConnection.status !== SignalingServerRoomConnectionObject.ConnectionStatus.peerConnectionEstablished) )
                            master = true;

                        if (previousEstablishedConnection === null || previousEstablishedConnection.status !== SignalingServerRoomConnectionObject.ConnectionStatus.peerConnectionEstablished)
                            NodeSignalingServerProtocol.connectWebPeer( this.waitlistSlaves[i], this.waitlistMasters[j], previousEstablishedConnection );

                    }

                if (! master ) {

                    for (let j = 0; j < this.waitlistSlaves.length; j++)
                        if (this.waitlistSlaves[j].node.signaling.acceptWebPeers) {

                            let previousEstablishedConnection = SignalingServerRoomListConnections.searchSignalingServerRoomConnection(this.waitlistSlaves[i], this.waitlistSlaves[j]);

                            if (previousEstablishedConnection === null || previousEstablishedConnection.status !== SignalingServerRoomConnectionObject.ConnectionStatus.peerConnectionEstablished)
                                NodeSignalingServerProtocol.connectWebPeer( this.waitlistSlaves[i], this.waitlistSlaves[j], previousEstablishedConnection );

                        }

                }


            }


        setTimeout(this._connectWebPeers.bind(this), 2500);
    }

    recalculateSignalingWaitlistTypeFromConnection(connection) {

        let waitlist = this.searchNodeSignalingServerWaitlist(connection.client1);
        this._recalculateSignalingWaitlistType(waitlist);

        waitlist = this.searchNodeSignalingServerWaitlist(connection.client2);
        this._recalculateSignalingWaitlistType(waitlist);

    }

    _recalculateSignalingWaitlistType(client1){

        if (client1 === null) return;

        let uuid = client1.node.sckAddress.uuid;

        try{

            let countSlaves = 0;
            let countMasters = 0;

            for (let i = 0; i<SignalingServerRoomListConnections.list.length; i++){


                let connection = SignalingServerRoomListConnections.list[i];
                if (connection.status !== SignalingServerRoomConnectionObject.ConnectionStatus.peerConnectionEstablished && connection.status !== SignalingServerRoomConnectionObject.ConnectionStatus.peerConnectionAlreadyConnected )
                    continue;

                let client1, client2;

                if (connection.client1.node.sckAddress.uuid === uuid ){
                    client1 = SignalingServerRoomListConnections.list[i].client1;
                    client2 = SignalingServerRoomListConnections.list[i].client2;
                } else
                if (connection.client2.node.sckAddress.uuid === uuid ){
                    client1 = SignalingServerRoomListConnections.list[i].client2;
                    client2 = SignalingServerRoomListConnections.list[i].client1;
                }

                if (client2 !== undefined){

                    let signalingWaitlistClient2 = this.searchNodeSignalingServerWaitlist(client2);

                    if (signalingWaitlistClient2.node.signaling.type === NodeSignalingServerWaitlistObjectType.NODE_SIGNALING_SERVER_WAITLIST_MASTER) {
                        console.log(connection.id, connection.status, "signalingWaitlistClient2 master", signalingWaitlistClient2.node.sckAddress.getAddress(false), signalingWaitlistClient2.node.sckAddress.uuid )
                        countMasters++;
                    }
                    else
                    if (signalingWaitlistClient2.node.signaling.type === NodeSignalingServerWaitlistObjectType.NODE_SIGNALING_SERVER_WAITLIST_SLAVE) {
                        console.log(connection.id, connection.status, "signalingWaitlistClient2 slave", signalingWaitlistClient2.node.sckAddress.getAddress(false), signalingWaitlistClient2.node.sckAddress.uuid )
                        countSlaves++;
                    }

                }

            }
            console.log(""); console.log("");

            if (client1.node.signaling.type === NodeSignalingServerWaitlistObjectType.NODE_SIGNALING_SERVER_WAITLIST_SLAVE){

                if (countMasters >= 2){

                    //slave connected to multiple masters
                    client1.node.sendRequest("signals/client/you-are-slave/sync", {});

                    setTimeout(()=>{
                        client1.disconnect();
                    }, 1000);

                } else if (countSlaves > 4 || !client1.node.signaling.acceptWebPeers){

                    client1.node.signaling.type = NodeSignalingServerWaitlistObjectType.NODE_SIGNALING_SERVER_WAITLIST_MASTER;

                    this.waitlistMasters.push(client1);
                    this._deleteNode(client1, this.waitlistSlaves);

                }

            } else if (client1.node.signaling.type === NodeSignalingServerWaitlistObjectType.NODE_SIGNALING_SERVER_WAITLIST_MASTER){

                //converting master to slave

                if (countMasters >= 2){

                    client1.node.signaling.type = NodeSignalingServerWaitlistObjectType.NODE_SIGNALING_SERVER_WAITLIST_SLAVE;

                    this.waitlistSlaves.push(client1);
                    this._deleteNode(client1, this.waitlistMasters);

                    client1.node.sendRequest("signals/client/you-are-slave/sync", {});

                    setTimeout(()=>{
                        client1.disconnect();
                    }, 1000);

                }


            }

        }catch (exception){

        }


    }

}

export default new NodeSignalingServerService();