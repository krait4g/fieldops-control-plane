package io.krait.fieldops.simulator.camera;

import java.io.StringReader;
import java.time.Duration;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

@RestController
@Profile("b04-camera")
@RequestMapping("/onvif")
public class OnvifController {
    private static final MediaType SOAP = MediaType.parseMediaType("application/soap+xml;charset=UTF-8");
    private final OnvifCameraState state;
    private final String publicOrigin;
    private final String rtspUri;
    private final String profileToken;

    public OnvifController(OnvifCameraState state,
            @Value("${fieldops.b04.camera.public-origin}") String publicOrigin,
            @Value("${fieldops.b04.camera.rtsp-uri}") String rtspUri,
            @Value("${fieldops.b04.camera.profile-token}") String profileToken) {
        this.state = state;
        this.publicOrigin = publicOrigin;
        this.rtspUri = rtspUri;
        this.profileToken = profileToken;
    }

    @PostMapping(path = {"/device_service", "/media_service", "/ptz_service"},
            consumes = {"application/soap+xml", "text/xml"}, produces = "application/soap+xml")
    ResponseEntity<String> invoke(@RequestBody String request) {
        try {
            Document document = parseSecurely(request);
            if (contains(document, "GetCapabilities")) return ok(capabilities());
            if (contains(document, "GetProfiles")) return ok(profiles());
            if (contains(document, "GetStreamUri")) return ok(streamUri());
            if (contains(document, "GetStatus")) return ok(status());
            if (contains(document, "ContinuousMove")) return continuousMove(document);
            if (contains(document, "Stop")) {
                requireProfile(document);
                state.stop();
                return ok("<tptz:StopResponse/>");
            }
            return fault("ter:ActionNotSupported", "Unsupported ONVIF action");
        } catch (Exception error) {
            return fault("ter:InvalidArgVal", "Malformed or invalid ONVIF request");
        }
    }

    private ResponseEntity<String> continuousMove(Document document) {
        requireProfile(document);
        Element panTilt = first(document, "PanTilt");
        Element zoom = first(document, "Zoom");
        double pan = attribute(panTilt, "x", 0);
        double tilt = attribute(panTilt, "y", 0);
        double zoomVelocity = attribute(zoom, "x", 0);
        String timeoutText = text(document, "Timeout", "PT0.5S");
        long timeoutMillis = Math.min(500, Math.max(1, Duration.parse(timeoutText).toMillis()));
        state.continuousMove(pan, tilt, zoomVelocity, timeoutMillis);
        return ok("<tptz:ContinuousMoveResponse/>");
    }

    private String capabilities() {
        return """
                <tds:GetCapabilitiesResponse><tds:Capabilities>
                  <tt:Media XAddr="%s/onvif/media_service"/>
                  <tt:PTZ XAddr="%s/onvif/ptz_service"/>
                </tds:Capabilities></tds:GetCapabilitiesResponse>
                """.formatted(publicOrigin, publicOrigin);
    }

    private String profiles() {
        return """
                <trt:GetProfilesResponse><trt:Profiles token="%s" fixed="true">
                  <tt:Name>FieldOps Synthetic Camera</tt:Name>
                  <tt:VideoSourceConfiguration token="video-source-main"/>
                  <tt:VideoEncoderConfiguration token="video-encoder-h264"/>
                  <tt:PTZConfiguration token="ptz-main"/>
                </trt:Profiles></trt:GetProfilesResponse>
                """.formatted(profileToken);
    }

    private String streamUri() {
        return """
                <trt:GetStreamUriResponse><trt:MediaUri>
                  <tt:Uri>%s</tt:Uri><tt:InvalidAfterConnect>false</tt:InvalidAfterConnect>
                  <tt:InvalidAfterReboot>false</tt:InvalidAfterReboot><tt:Timeout>PT60S</tt:Timeout>
                </trt:MediaUri></trt:GetStreamUriResponse>
                """.formatted(rtspUri);
    }

    private String status() {
        OnvifCameraState.Pose pose = state.status();
        return """
                <tptz:GetStatusResponse><tptz:PTZStatus>
                  <tt:Position><tt:PanTilt x="%.6f" y="%.6f"/><tt:Zoom x="%.6f"/></tt:Position>
                  <tt:MoveStatus><tt:PanTilt>%s</tt:PanTilt><tt:Zoom>%s</tt:Zoom></tt:MoveStatus>
                  <tt:UtcTime>%s</tt:UtcTime>
                </tptz:PTZStatus></tptz:GetStatusResponse>
                """.formatted(pose.pan(), pose.tilt(), pose.zoom(),
                pose.moving() ? "MOVING" : "IDLE", pose.moving() ? "MOVING" : "IDLE",
                pose.observedAt());
    }

    private void requireProfile(Document document) {
        if (!profileToken.equals(text(document, "ProfileToken", ""))) {
            throw new IllegalArgumentException("Unknown profile token");
        }
    }

    private static Document parseSecurely(String xml) throws Exception {
        if (xml == null || xml.length() > 65_536) throw new IllegalArgumentException("SOAP body too large");
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(true);
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
        factory.setXIncludeAware(false);
        factory.setExpandEntityReferences(false);
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
        return factory.newDocumentBuilder().parse(new InputSource(new StringReader(xml)));
    }

    private static boolean contains(Document document, String localName) {
        return document.getElementsByTagNameNS("*", localName).getLength() == 1;
    }

    private static Element first(Document document, String localName) {
        NodeList nodes = document.getElementsByTagNameNS("*", localName);
        return nodes.getLength() == 0 ? null : (Element) nodes.item(0);
    }

    private static double attribute(Element element, String name, double defaultValue) {
        if (element == null || !element.hasAttribute(name)) return defaultValue;
        return Double.parseDouble(element.getAttribute(name));
    }

    private static String text(Document document, String localName, String defaultValue) {
        NodeList nodes = document.getElementsByTagNameNS("*", localName);
        if (nodes.getLength() == 0) return defaultValue;
        Node node = nodes.item(0);
        return node.getTextContent().strip();
    }

    private static ResponseEntity<String> ok(String body) {
        return ResponseEntity.ok().contentType(SOAP).body(envelope(body));
    }

    private static ResponseEntity<String> fault(String code, String reason) {
        String body = """
                <s:Fault><s:Code><s:Value>s:Sender</s:Value><s:Subcode><s:Value>%s</s:Value></s:Subcode></s:Code>
                <s:Reason><s:Text xml:lang="en">%s</s:Text></s:Reason></s:Fault>
                """.formatted(code, reason);
        return ResponseEntity.internalServerError().contentType(SOAP).body(envelope(body));
    }

    private static String envelope(String body) {
        return """
                <?xml version="1.0" encoding="UTF-8"?>
                <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
                  xmlns:tds="http://www.onvif.org/ver10/device/wsdl"
                  xmlns:trt="http://www.onvif.org/ver10/media/wsdl"
                  xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"
                  xmlns:tt="http://www.onvif.org/ver10/schema"
                  xmlns:ter="http://www.onvif.org/ver10/error">
                  <s:Body>%s</s:Body>
                </s:Envelope>
                """.formatted(body);
    }
}
