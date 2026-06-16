import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Container, Row, Col, Button, Badge, Alert,
  Card, ProgressBar, Spinner, ListGroup,
} from 'react-bootstrap';
import NetworkMap from '../components/NetworkMap';
import API from '../api';

const PLANNING_SECONDS = 90;