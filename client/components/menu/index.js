import React from 'react';
import { connect } from 'react-redux';
import { NavLink } from 'react-router-dom';
import PropTypes from 'prop-types';

import URL from '../../urls';
import { translate as $t } from '../../helpers';
import { get } from '../../store';
import { findRedundantPairs } from '../duplicates';

import About from './about';
import BankList from './banks';

const Entry = props => {
    let { className = '' } = props;
    return (
        <li className={className}>
            <NavLink to={props.path} activeClassName="active">
                <i className={`fa fa-${props.icon}`} />
                {props.children}
            </NavLink>
        </li>
    );
};

Entry.propTypes = {
    // The path to which the link directs.
    path: PropTypes.string.isRequired,

    // Icon to be displayed.
    icon: PropTypes.string.isRequired,

    // The class name to apply to the li.
    className: PropTypes.string
};

const DuplicatesEntry = connect((state, props) => {
    const { currentAccountId } = props;
    return {
        numDuplicates: findRedundantPairs(state, currentAccountId).length
    };
})(props => {
    let { currentAccountId, numDuplicates } = props;
    // Do not display the badge if there are no duplicates.
    const badge = numDuplicates ? <span className="badge">{numDuplicates}</span> : null;
    return (
        <Entry path={URL.duplicates.url(currentAccountId)} icon="clone" className="duplicates">
            <span>{$t('client.menu.duplicates')}</span>
            {badge}
        </Entry>
    );
});

const Menu = props => {
    let currentAccountId = URL.sections.accountId(props.match);

    // Update the subsection in the links of the menu
    const chartsSubsection = URL.sections.sub(props.match, 'charts', props.defaultChart);

    return (
        <nav className={props.isHidden ? 'menu-hidden' : ''}>
            <BankList currentAccountId={currentAccountId} location={props.location} />

            <ul className="sidebar-section-list">
                <Entry path={URL.reports.url(currentAccountId)} icon="briefcase">
                    <span>{$t('client.menu.reports')}</span>
                </Entry>
                <Entry path={URL.budgets.url(currentAccountId)} icon="heartbeat">
                    <span>{$t('client.menu.budget')}</span>
                </Entry>
                <Entry path={URL.charts.url(chartsSubsection, currentAccountId)} icon="line-chart">
                    <span>{$t('client.menu.charts')}</span>
                </Entry>
                {/* Pass down the location so that the active class is set
                when changing location. */}
                <DuplicatesEntry currentAccountId={currentAccountId} location={props.location} />
            </ul>

            <div className="sidebar-about">
                <About />
            </div>
        </nav>
    );
};

Menu.propTypes = {
    // The kind of chart to display: by categories, balance, or in and outs for all accounts.
    defaultChart: PropTypes.string.isRequired,
    // Tells whether the menu shall be shown or not
    isHidden: PropTypes.bool.isRequired
};

const Export = connect(state => {
    return {
        defaultChart: get.setting(state, 'default-chart-display-type')
    };
})(Menu);

export default Export;
