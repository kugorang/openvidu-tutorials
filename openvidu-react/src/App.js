import React, { Component } from "react";
import { OpenVidu } from "openvidu-browser";

import axios from "axios";
import "./App.css";
import UserVideoComponent from "./UserVideoComponent";

const APPLICATION_SERVER_URL =
  process.env.NODE_ENV === "production" ? "" : "https://motionbe.at:5000/";

// Webpack require.context를 사용하여 모든 mp3 파일 로드
// 사용 예: soundClips['snare'] 또는 soundClips['drum_1']
const soundFiles = require.context("./drum", false, /\.mp3$/);

class App extends Component {
  constructor(props) {
    super(props);

    // These properties are in the state's component in order to re-render the HTML whenever their values change
    this.state = {
      mySessionId: "SessionA",
      myUserName: "Participant" + Math.floor(Math.random() * 100),
      session: undefined,
      mainStreamManager: undefined, // Main video of the page. Will be the 'publisher' or one of the 'subscribers'
      publisher: undefined,
      subscribers: [],
      audioClips: {}, // Audio 객체를 포함하는 state 초기화
    };

    this.joinSession = this.joinSession.bind(this);
    this.leaveSession = this.leaveSession.bind(this);
    this.switchCamera = this.switchCamera.bind(this);
    this.handleChangeSessionId = this.handleChangeSessionId.bind(this);
    this.handleChangeUserName = this.handleChangeUserName.bind(this);
    this.handleMainVideoStream = this.handleMainVideoStream.bind(this);
    this.onbeforeunload = this.onbeforeunload.bind(this);
    this.playAudio = this.playAudio.bind(this); // 오디오 재생 함수 바인딩
    this.handleKeyDown = this.handleKeyDown.bind(this); // 키보드 이벤트 함수 바인딩
  }

  componentDidMount() {
    window.addEventListener("beforeunload", this.onbeforeunload);
    this.loadAudioClips();
  }

  componentWillUnmount() {
    window.removeEventListener("beforeunload", this.onbeforeunload);
  }

  onbeforeunload(event) {
    this.leaveSession();
  }

  handleChangeSessionId(e) {
    this.setState({
      mySessionId: e.target.value,
    });
  }

  handleChangeUserName(e) {
    this.setState({
      myUserName: e.target.value,
    });
  }

  handleMainVideoStream(stream) {
    if (this.state.mainStreamManager !== stream) {
      this.setState({
        mainStreamManager: stream,
      });
    }
  }

  // soundFiles에서 Audio 객체를 생성하고 state에 저장
  loadAudioClips() {
    soundFiles.keys().reduce((clips, fileName) => {
      const clipKey = fileName.replace("./", "").replace(".mp3", "");
      const filePath = soundFiles(fileName);
      this.addOrUpdateAudioClip(clipKey, filePath);
    }, {});
  }

  addOrUpdateAudioClip(clipKey, audioFile) {
    this.setState((prevState) => ({
      audioClips: {
        ...prevState.audioClips, // 기존의 오디오 클립들을 복사
        [clipKey]: new Audio(audioFile), // 새 오디오 클립 추가 또는 기존 클립 갱신
      },
    }));
  }

  deleteSubscriber(streamManager) {
    let subscribers = this.state.subscribers;
    let index = subscribers.indexOf(streamManager, 0);
    if (index > -1) {
      subscribers.splice(index, 1);
      this.setState({
        subscribers: subscribers,
      });
    }
  }

  playAudio(keyValue) {
    switch (keyValue) {
      case "q":
      case "Q":
        this.state.audioClips["drum_1"].play();
        break;
      case "w":
      case "W":
        this.state.audioClips["drum_2"].play();
        break;
      case "e":
      case "E":
        this.state.audioClips["drum_3"].play();
        break;
      case "a":
      case "A":
        this.state.audioClips["drum_4"].play();
        break;
      case "s":
      case "S":
        this.state.audioClips["drum_5"].play();
        break;
      case "d":
      case "D":
        this.state.audioClips["snare"].play();
        break;
    }
  }

  handleKeyDown(event) {
    // 키 입력을 신호로 전송
    const inputKey = event.key; // 키의 식별자를 가져옴
    const mySession = this.state.session;

    mySession
      .signal({
        data: JSON.stringify({userName: mySession.myUserName, keyCode: inputKey}), // 실제 키의 식별자를 데이터로 사용
        to: this.state.subscribers, // 모든 구독자에게 신호를 보냄
        type: "key-signal", // 신호 유형 정의
      })
      .then(() => {
        console.log("[KHW] Send, key-signal successfully: " + inputKey);
        this.playAudio(inputKey); // 오디오 재생
      })
      .catch((error) => {
        console.error("[KHW] Error sending signal:", error);
      });
  }

  joinSession() {
    // --- 1) Get an OpenVidu object ---

    this.OV = new OpenVidu();

    // --- 2) Init a session ---

    this.setState(
      {
        session: this.OV.initSession(),
      },
      () => {
        var mySession = this.state.session;

        // --- 3) Specify the actions when events take place in the session ---

        // On every new Stream received...
        mySession.on("streamCreated", (event) => {
          // Subscribe to the Stream to receive it. Second parameter is undefined
          // so OpenVidu doesn't create an HTML video by its own
          console.log("[KHW] Receive, streamCreated: " + event.stream.connection.connectionId);

          if (event.stream.connection.connectionId !== mySession.connection.connectionId) {
            console.log("[KHW] Receive, different user");
            var subscriber = mySession.subscribe(event.stream, undefined);
            var subscribers = this.state.subscribers;
            subscribers.push(subscriber);

            // Update the state with the new subscribers
            this.setState({
              subscribers: subscribers,
            });
          }
        });

        // On every Stream destroyed...
        mySession.on("streamDestroyed", (event) => {
          // Remove the stream from 'subscribers' array
          console.log("[KHW] Receive, streamDestroyed: " + event.stream.streamManager.stream.connection.data);
          this.deleteSubscriber(event.stream.streamManager);
        });

        // On every asynchronous exception...
        mySession.on("exception", (exception) => {
          console.log("[KHW] Receive, Exception: " + exception.code + " - " + exception.message);
          console.warn(exception);
        });

        mySession.on("signal:key-signal", (event) => {
          console.log("[KHW] Receive, Key signal received: " + event.data); // Message
          this.playAudio(event.data);
        });

        // Receiver of the message (usually before calling 'session.connect')
        // mySession.on("signal:my-chat", (event) => {
        //   console.log(event.data); // Message
        //   console.log(event.from); // Connection object of the sender
        //   console.log(event.type); // The type of message ("my-chat")
        // });

        // Receiver of all messages (usually before calling 'session.connect')
        // mySession.on("signal", (event) => {
        //   console.log(event.data); // Message
        //   console.log(event.from); // Connection object of the sender
        //   console.log(event.type); // The type of message
        // });

        // mySession.on("connectionCreated", (event) => {
        //   console.log(event.connection);
        // });

        // --- 4) Connect to the session with a valid user token ---

        // Get a token from the OpenVidu deployment
        this.getToken().then((token) => {
          // First param is the token got from the OpenVidu deployment. Second param can be retrieved by every user on event
          // 'streamCreated' (property Stream.connection.data), and will be appended to DOM as the user's nickname
          mySession
            .connect(token, { clientData: this.state.myUserName })
            .then(async () => {
              // --- 5) Get your own camera stream ---

              // Init a publisher passing undefined as targetElement (we don't want OpenVidu to insert a video
              // element: we will manage it on our own) and with the desired properties
              let publisher = await this.OV.initPublisherAsync(undefined, {
                audioSource: undefined, // The source of audio. If undefined default microphone
                videoSource: undefined, // The source of video. If undefined default webcam
                publishAudio: false, // Whether you want to start publishing with your audio unmuted or not
                publishVideo: true, // Whether you want to start publishing with your video enabled or not
                resolution: "640x480", // The resolution of your video
                frameRate: 30, // The frame rate of your video
                insertMode: "APPEND", // How the video is inserted in the target element 'video-container'
                mirror: false, // Whether to mirror your local video or not
              });

              // --- 6) Publish your stream ---

              mySession.publish(publisher);

              // Obtain the current video device in use
              var devices = await this.OV.getDevices();
              var videoDevices = devices.filter(
                (device) => device.kind === "videoinput"
              );
              var currentVideoDeviceId = publisher.stream
                .getMediaStream()
                .getVideoTracks()[0]
                .getSettings().deviceId;
              var currentVideoDevice = videoDevices.find(
                (device) => device.deviceId === currentVideoDeviceId
              );

              // Set the main video in the page to display our webcam and store our Publisher
              this.setState({
                currentVideoDevice: currentVideoDevice,
                mainStreamManager: publisher,
                publisher: publisher,
              });

              // Sender of the message (after 'session.connect')
              // mySession
              //   .signal({
              //     data: "My custom message", // Any string (optional)
              //     to: [], // Array of Connection objects (optional. Broadcast to everyone if empty)
              //     type: "my-chat", // The type of message (optional)
              //   })
              //   .then(() => {
              //     console.log("Message successfully sent");
              //   })
              //   .catch((error) => {
              //     console.error(error);
              //   });

              // mySession.signal({
              //   data: "My private custom message",
              //   to: [connection1, connection2],
              //   type: "my-private-chat",
              // });

              window.addEventListener("keydown", this.handleKeyDown); // 키 입력 리스너 추가
            })
            .catch((error) => {
              console.log(
                "There was an error connecting to the session:",
                error.code,
                error.message
              );
            });
        });
      }
    );
  }

  leaveSession() {
    // --- 7) Leave the session by calling 'disconnect' method over the Session object ---

    const mySession = this.state.session;

    if (mySession) {
      mySession.disconnect();
      window.removeEventListener("keydown", this.handleKeyDown); // 키 입력 리스너 제거
    }

    // Empty all properties...
    this.OV = null;
    this.setState({
      session: undefined,
      subscribers: [],
      mySessionId: "SessionA",
      myUserName: "Participant" + Math.floor(Math.random() * 100),
      mainStreamManager: undefined,
      publisher: undefined,
    });
  }

  async switchCamera() {
    try {
      const devices = await this.OV.getDevices();
      var videoDevices = devices.filter(
        (device) => device.kind === "videoinput"
      );

      if (videoDevices && videoDevices.length > 1) {
        var newVideoDevice = videoDevices.filter(
          (device) => device.deviceId !== this.state.currentVideoDevice.deviceId
        );

        if (newVideoDevice.length > 0) {
          // Creating a new publisher with specific videoSource
          // In mobile devices the default and first camera is the front one
          var newPublisher = this.OV.initPublisher(undefined, {
            videoSource: newVideoDevice[0].deviceId,
            publishAudio: false,
            publishVideo: true,
            mirror: true,
          });

          //newPublisher.once("accessAllowed", () => {
          await this.state.session.unpublish(this.state.mainStreamManager);

          await this.state.session.publish(newPublisher);
          this.setState({
            currentVideoDevice: newVideoDevice[0],
            mainStreamManager: newPublisher,
            publisher: newPublisher,
          });
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  render() {
    const mySessionId = this.state.mySessionId;
    const myUserName = this.state.myUserName;

    return (
      <div className="container">
        {this.state.session === undefined ? (
          <div id="join">
            <div id="img-div">
              <img
                src="resources/images/openvidu_grey_bg_transp_cropped.png"
                alt="OpenVidu logo"
              />
            </div>
            <div id="join-dialog" className="jumbotron vertical-center">
              <h1> Join a video session </h1>
              <form className="form-group" onSubmit={this.joinSession}>
                <p>
                  <label>Participant: </label>
                  <input
                    className="form-control"
                    type="text"
                    id="userName"
                    value={myUserName}
                    onChange={this.handleChangeUserName}
                    required
                  />
                </p>
                <p>
                  <label> Session: </label>
                  <input
                    className="form-control"
                    type="text"
                    id="sessionId"
                    value={mySessionId}
                    onChange={this.handleChangeSessionId}
                    required
                  />
                </p>
                <p className="text-center">
                  <input
                    className="btn btn-lg btn-success"
                    name="commit"
                    type="submit"
                    value="JOIN"
                  />
                </p>
              </form>
            </div>
          </div>
        ) : null}

        {this.state.session !== undefined ? (
          <div id="session">
            <div id="session-header">
              <h1 id="session-title">{mySessionId}</h1>
              <input
                className="btn btn-large btn-danger"
                type="button"
                id="buttonLeaveSession"
                onClick={this.leaveSession}
                value="Leave session"
              />
              <input
                className="btn btn-large btn-success"
                type="button"
                id="buttonSwitchCamera"
                onClick={this.switchCamera}
                value="Switch Camera"
              />
            </div>

            {this.state.mainStreamManager !== undefined ? (
              <div id="main-video" className="col-md-6">
                <UserVideoComponent
                  streamManager={this.state.mainStreamManager}
                />
              </div>
            ) : null}
            <div id="video-container" className="col-md-6">
              {this.state.publisher !== undefined ? (
                <div
                  className="stream-container col-md-6 col-xs-6"
                  onClick={() =>
                    this.handleMainVideoStream(this.state.publisher)
                  }
                >
                  <UserVideoComponent streamManager={this.state.publisher} />
                </div>
              ) : null}
              {this.state.subscribers.map((sub, i) => (
                <div
                  key={sub.id}
                  className="stream-container col-md-6 col-xs-6"
                  onClick={() => this.handleMainVideoStream(sub)}
                >
                  <span>{sub.id}</span>
                  <UserVideoComponent streamManager={sub} />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  /**
   * --------------------------------------------
   * GETTING A TOKEN FROM YOUR APPLICATION SERVER
   * --------------------------------------------
   * The methods below request the creation of a Session and a Token to
   * your application server. This keeps your OpenVidu deployment secure.
   *
   * In this sample code, there is no user control at all. Anybody could
   * access your application server endpoints! In a real production
   * environment, your application server must identify the user to allow
   * access to the endpoints.
   *
   * Visit https://docs.openvidu.io/en/stable/application-server to learn
   * more about the integration of OpenVidu in your application server.
   */
  async getToken() {
    const sessionId = await this.createSession(this.state.mySessionId);
    return await this.createToken(sessionId);
  }

  async createSession(sessionId) {
    const response = await axios.post(
      APPLICATION_SERVER_URL + "api/openvidu",
      { customSessionId: sessionId },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
    return response.data; // The sessionId
  }

  async createToken(sessionId) {
    const response = await axios.post(
      APPLICATION_SERVER_URL + "api/openvidu/" + sessionId + "/connections",
      {},
      {
        headers: { "Content-Type": "application/json" },
      }
    );
    return response.data; // The token
  }
}

export default App;
